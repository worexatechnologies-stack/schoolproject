from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
import re
import datetime
from django.db.models import Q
from apps.accounts.models import User
from apps.common.tenancy import TenantScopedViewSet
from apps.finance.models import FeeStructure, FeeQuarter, StudentFeeRecord, FeePayment
from apps.finance.serializers import FeeStructureSerializer, FeeQuarterSerializer, StudentFeeRecordSerializer, FeePaymentSerializer
from apps.sis.models import Student


def resolve_fee_structure_for_student(student, academic_year=None, academic_year_id=None, school_id=None):
    """Resolves the single authoritative FeeStructure for a student using the 4-tier ID hierarchy:
    1. Student-level Fee Structure (target_student_id / target_student_ref)
    2. Section-level Fee Structure (target_section_ref / target_section)
    3. Class-level Fee Structure (target_class_ref / target_class)
    4. School-level Fee Structure (level='school')
    5. None
    Strictly scoped to the student's school to prevent cross-school contamination.
    """
    if not student:
        return None

    class_id = None
    section_id = None
    if student.section_record:
        section_id = student.section_record_id
        class_id = student.section_record.class_room_id

    if not academic_year and student.academic_year:
        academic_year = student.academic_year

    target_school = (student.school_id if student else None) or school_id
    qs = FeeStructure.objects.all().prefetch_related('quarter_records')
    if target_school:
        qs = qs.filter(school_id=target_school)

    if academic_year_id:
        qs = qs.filter(academic_year_ref_id=academic_year_id)
    elif academic_year:
        qs = qs.filter(academic_year=academic_year)

    # 1. Student-level Fee Structure
    student_fs = qs.filter(
        Q(level='student') &
        (Q(target_student_id=str(student.id)) | Q(target_student_id=student.admission_no) | Q(target_student_ref=student))
    ).first()
    if student_fs:
        return student_fs

    # 2. Section-level Fee Structure
    if section_id:
        section_fs = qs.filter(level='section', target_section_ref_id=section_id).first()
        if section_fs:
            return section_fs
    if student.section:
        section_fs = qs.filter(level='section', target_section__iexact=student.section).first()
        if section_fs and (not class_id or section_fs.target_class_ref_id == int(class_id) or (student.class_name and section_fs.target_class and section_fs.target_class.lower() == student.class_name.lower())):
            return section_fs

    # 3. Class-level Fee Structure
    if class_id:
        class_fs = qs.filter(level='class', target_class_ref_id=class_id).first()
        if class_fs:
            return class_fs
    if student.class_name:
        clean_cls = re.sub(r'(class|cls)', '', student.class_name, flags=re.IGNORECASE)
        clean_cls = re.sub(r'[^a-zA-Z0-9]', ' ', clean_cls).strip()
        base_cls = clean_cls.split()[0] if clean_cls else student.class_name
        class_fs = qs.filter(level='class').filter(
            Q(target_class__iexact=student.class_name) |
            Q(target_class__icontains=base_cls)
        ).first()
        if class_fs:
            return class_fs

    # 4. School-level Fee Structure
    school_fs = qs.filter(level='school').first()
    if school_fs:
        return school_fs

    return None


def get_student_fee_summary(student, academic_year=None, academic_year_id=None):
    """Calculates student's authoritative fee summary directly from database records:
    - Applicable Fee Structure (4-tier ID hierarchy)
    - Total Fees (structure items + custom adjustments - scholarships/discounts)
    - Total Paid (sum of all valid FeePayment transactions / payment records)
    - Balance Due (Total Fees - Total Paid)
    - Quarters Paid count and status breakdown
    """
    if not student:
        return None

    class_id = student.section_record.class_room_id if student.section_record else None
    section_id = student.section_record_id if student.section_record else None
    ay = academic_year or student.academic_year or '2026-2027'

    fee_structure = resolve_fee_structure_for_student(student, academic_year=ay, academic_year_id=academic_year_id)

    # Lookup StudentFeeRecord if exists
    fee_rec = StudentFeeRecord.objects.filter(
        Q(student=student) |
        Q(student_id_str=str(student.id)) |
        Q(admission_no=student.admission_no)
    ).first()

    # If no fee structure is configured:
    if not fee_structure:
        # Check if student has recorded payments anyway
        payments_qs = FeePayment.objects.filter(
            Q(student=student) |
            (Q(fee_record=fee_rec) if fee_rec else Q(pk__in=[]))
        ).order_by('-payment_date', '-created_at')

        payments_list = []
        total_paid = 0.0
        for p in payments_qs:
            amt = float(p.amount_paid)
            total_paid += amt
            payments_list.append({
                'id': p.id,
                'paymentDate': str(p.payment_date),
                'amountPaid': amt,
                'paymentMethod': p.payment_method,
                'transactionId': p.transaction_id,
                'receiptNo': p.receipt_no,
                'category': p.category,
                'installmentType': p.installment_type,
            })

        if not payments_list and fee_rec and fee_rec.payment_history:
            for p in fee_rec.payment_history:
                amt = float(p.get('amountPaid', 0))
                total_paid += amt
                payments_list.append(p)

        return {
            'studentId': student.id,
            'studentName': student.name,
            'admissionNo': student.admission_no,
            'class': student.class_name,
            'classId': class_id,
            'section': student.section,
            'sectionId': section_id,
            'academicYear': ay,
            'hasStructure': False,
            'feeStructureId': None,
            'feeStructureName': None,
            'totalFees': 0.0,
            'totalPaid': total_paid,
            'balanceDue': 0.0,
            'quartersPaid': 0,
            'totalQuarters': 0,
            'paymentStatus': 'PAID' if total_paid > 0 else 'UNCONFIGURED',
            'quarters': [],
            'payments': payments_list,
            'breakdown': [],
            'scholarship': 0.0,
            'discount': 0.0,
            'transportCharges': 0.0,
            'hostelCharges': 0.0,
            'fineAmount': 0.0,
        }

    # Structure found: calculate amounts
    base_items = fee_rec.custom_items if (fee_rec and fee_rec.custom_items and len(fee_rec.custom_items) > 0) else (fee_structure.items or [])
    base_total = sum(float(item.get('amount', 0)) for item in base_items)

    scholarship = float(fee_rec.scholarship) if fee_rec else 0.0
    discount = float(fee_rec.discount) if fee_rec else 0.0
    transport = float(fee_rec.transport_charges) if fee_rec else 0.0
    hostel = float(fee_rec.hostel_charges) if fee_rec else 0.0
    fine = float(fee_rec.fine_amount) if fee_rec else 0.0

    total_fees = max(0.0, base_total + transport + hostel + fine - scholarship - discount)

    # Query all payments for this student
    payments_qs = FeePayment.objects.filter(
        Q(student=student) |
        (Q(fee_record=fee_rec) if fee_rec else Q(pk__in=[]))
    ).order_by('-payment_date', '-created_at')

    payments_list = []
    total_paid = 0.0
    for p in payments_qs:
        amt = float(p.amount_paid)
        total_paid += amt
        payments_list.append({
            'id': p.id,
            'paymentDate': str(p.payment_date),
            'amountPaid': amt,
            'paymentMethod': p.payment_method,
            'transactionId': p.transaction_id,
            'receiptNo': p.receipt_no,
            'category': p.category,
            'installmentType': p.installment_type,
            'quarterId': p.quarter_id,
        })

    # If no FeePayment rows but fee_rec.payment_history has payments, include them
    if not payments_list and fee_rec and fee_rec.payment_history:
        for p in fee_rec.payment_history:
            amt = float(p.get('amountPaid', 0))
            total_paid += amt
            payments_list.append(p)

    # Fallback to student.fee_paid if greater
    if float(student.fee_paid or 0) > total_paid:
        total_paid = float(student.fee_paid)

    # Synchronize student model
    if student.fee_paid != total_paid or student.fee_total != total_fees:
        Student.objects.filter(pk=student.pk).update(fee_paid=total_paid, fee_total=total_fees)

    balance_due = max(0.0, total_fees - total_paid)

    # Quarters breakdown
    raw_quarters = fee_rec.custom_quarters if (fee_rec and fee_rec.custom_quarters and len(fee_rec.custom_quarters) > 0) else (fee_structure.quarters or [])
    
    # If no quarters in structure JSON, fetch from FeeQuarter records
    if not raw_quarters:
        raw_quarters = [
            {
                'id': q.id,
                'quarter': f"Q{q.quarter_number}",
                'name': q.quarter_name,
                'amount': float(q.assigned_amount),
                'dueDate': str(q.due_date) if q.due_date else '',
            }
            for q in fee_structure.quarter_records.all().order_by('quarter_number')
        ]

    running_paid = total_paid
    today_str = datetime.date.today().isoformat()
    quarters_list = []

    for idx, q_data in enumerate(raw_quarters):
        q_amt = float(q_data.get('amount', 0))
        q_due = q_data.get('dueDate') or q_data.get('due_date') or ''
        q_name = q_data.get('name') or q_data.get('quarter_name') or f"Quarter {idx+1}"
        q_code = q_data.get('quarter') or f"Q{idx+1}"

        if running_paid >= q_amt and q_amt > 0:
            q_paid = q_amt
            q_rem = 0.0
            q_status = 'PAID'
            running_paid -= q_amt
        elif running_paid > 0:
            q_paid = running_paid
            q_rem = round(q_amt - running_paid, 2)
            q_status = 'PARTIALLY_PAID'
            running_paid = 0.0
        else:
            q_paid = 0.0
            q_rem = q_amt
            if q_due and today_str > str(q_due):
                q_status = 'OVERDUE'
            else:
                q_status = 'PAYMENT_DUE'

        quarters_list.append({
            'quarterId': q_data.get('id'),
            'quarter': q_code,
            'name': q_name,
            'requiredAmount': q_amt,
            'amountPaid': q_paid,
            'remainingAmount': q_rem,
            'dueDate': q_due,
            'status': q_status,
        })

    quarters_paid = sum(1 for q in quarters_list if q['status'] == 'PAID')
    total_quarters = len(quarters_list)

    if total_fees > 0 and balance_due == 0:
        overall_status = 'PAID'
    elif total_paid > 0:
        overall_status = 'PARTIALLY_PAID'
    else:
        overall_status = 'UNPAID'

    return {
        'studentId': student.id,
        'studentName': student.name,
        'admissionNo': student.admission_no,
        'class': student.class_name,
        'classId': class_id,
        'section': student.section,
        'sectionId': section_id,
        'academicYear': ay,
        'hasStructure': True,
        'feeStructureId': fee_structure.id,
        'feeStructureName': fee_structure.name,
        'totalFees': total_fees,
        'totalPaid': total_paid,
        'balanceDue': balance_due,
        'quartersPaid': quarters_paid,
        'totalQuarters': total_quarters,
        'paymentStatus': overall_status,
        'quarters': quarters_list,
        'payments': payments_list,
        'breakdown': base_items,
        'scholarship': scholarship,
        'discount': discount,
        'transportCharges': transport,
        'hostelCharges': hostel,
        'fineAmount': fine,
    }


class FeeStructureViewSet(TenantScopedViewSet):
    queryset = FeeStructure.objects.all().order_by('-created_at')
    serializer_class = FeeStructureSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        academic_year = self.request.query_params.get('academic_year')
        academic_year_id = self.request.query_params.get('academic_year_id')
        target_class_id = self.request.query_params.get('target_class_id')
        target_section_id = self.request.query_params.get('target_section_id')
        target_student_id = self.request.query_params.get('target_student_id')
        target_class = self.request.query_params.get('target_class')

        if academic_year_id:
            qs = qs.filter(academic_year_ref_id=academic_year_id)
        elif academic_year:
            qs = qs.filter(academic_year=academic_year)

        if target_section_id:
            qs = qs.filter(target_section_ref_id=target_section_id)

        if target_class_id:
            qs = qs.filter(Q(target_class_ref_id=target_class_id) | Q(target_section_ref__class_room_id=target_class_id))
        elif target_class and target_class != 'All':
            clean_cls = re.sub(r'(class|cls)', '', target_class, flags=re.IGNORECASE)
            clean_cls = re.sub(r'[^a-zA-Z0-9]', ' ', clean_cls).strip()
            base_cls = clean_cls.split()[0] if clean_cls else target_class
            qs = qs.filter(
                Q(target_class__icontains=target_class) |
                Q(target_class__icontains=base_cls) |
                Q(target_class__iexact=target_class)
            )

        if target_student_id:
            qs = qs.filter(Q(target_student_id=target_student_id) | Q(target_student_ref__id=target_student_id if str(target_student_id).isdigit() else None))

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        school = getattr(user, 'school', None)
        if school:
            serializer.save(school=school)
        else:
            serializer.save()

    @action(detail=False, methods=['get'], url_path='resolve')
    def resolve(self, request):
        """Authoritative Fee Structure Resolution Endpoint obeying 4-tier ID hierarchy:
        1. Student-level Fee Structure (target_student_id / target_student_ref)
        2. Section-level Fee Structure (target_section_id / target_class_id)
        3. Class-level Fee Structure (target_class_id)
        4. School-level Fee Structure (level='school')
        5. No Fee Structure Available -> Returns HTTP 200 with null fee_structure
        """
        user = request.user
        school_id = getattr(user, 'school_id', None)
        student_id = request.query_params.get('student_id')
        class_id = request.query_params.get('class_id')
        section_id = request.query_params.get('section_id')
        academic_year = request.query_params.get('academic_year')
        academic_year_id = request.query_params.get('academic_year_id')

        student = None
        if student_id:
            st_qs = Student.objects.all().select_related('section_record__class_room', 'school')
            if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
                st_qs = st_qs.filter(school_id=school_id)
            if str(student_id).isdigit():
                student = st_qs.filter(pk=student_id).first()
            if not student:
                student = st_qs.filter(admission_no=student_id).first()

        fs = resolve_fee_structure_for_student(student, academic_year=academic_year, academic_year_id=academic_year_id, school_id=school_id)
        if not fs and class_id:
            qs = FeeStructure.objects.all().prefetch_related('quarter_records')
            if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
                qs = qs.filter(school_id=school_id)
            if academic_year_id:
                qs = qs.filter(academic_year_ref_id=academic_year_id)
            elif academic_year:
                qs = qs.filter(academic_year=academic_year)
            fs = qs.filter(level='class', target_class_ref_id=class_id).first()

        if fs:
            return Response(FeeStructureSerializer(fs).data)

        # Fallback to school-level
        qs_school = FeeStructure.objects.filter(level='school')
        if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
            qs_school = qs_school.filter(school_id=school_id)
        school_fs = qs_school.first()
        if school_fs:
            return Response(FeeStructureSerializer(school_fs).data)

        return Response({'detail': 'No Fee Structure Available', 'fee_structure': None}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='student-summary')
    def student_summary(self, request):
        """Returns the full calculated fee summary for a student from DB records."""
        user = request.user
        school_id = getattr(user, 'school_id', None)
        student_id = request.query_params.get('student_id')
        if not student_id and request.user.is_authenticated and hasattr(request.user, 'student_profile'):
            student_id = request.user.student_profile.student_id

        if not student_id:
            return Response({'error': 'student_id query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        st_qs = Student.objects.all().select_related('section_record__class_room', 'school')
        if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
            st_qs = st_qs.filter(school_id=school_id)

        student = None
        if str(student_id).isdigit():
            student = st_qs.filter(pk=student_id).first()
        if not student:
            student = st_qs.filter(admission_no=student_id).first()

        if not student:
            return Response({'error': f'Student {student_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        summary = get_student_fee_summary(student)
        return Response(summary, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='student-summaries')
    def student_summaries(self, request):
        """Returns fee summaries for students matching class/section filters, strictly isolated by school."""
        user = request.user
        school_id = getattr(user, 'school_id', None)
        class_id = request.query_params.get('class_id')
        section_id = request.query_params.get('section_id')
        academic_year = request.query_params.get('academic_year')

        qs = Student.objects.all().select_related('section_record__class_room', 'school')
        if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
            qs = qs.filter(school_id=school_id)

        if section_id:
            qs = qs.filter(section_record_id=section_id)
        if class_id:
            qs = qs.filter(section_record__class_room_id=class_id)
        if academic_year:
            qs = qs.filter(academic_year=academic_year)

        summaries = [get_student_fee_summary(st) for st in qs[:200]]
        return Response(summaries, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='school-revenue')
    def school_revenue(self, request):
        """Returns authoritative, aggregated school revenue, receivables, and monthly receipts from PostgreSQL."""
        user = request.user
        school_id = getattr(user, 'school_id', None)
        academic_year = request.query_params.get('academic_year')

        students_qs = Student.objects.all().select_related('section_record__class_room', 'school')
        payments_qs = FeePayment.objects.all().select_related('student', 'quarter')

        if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
            students_qs = students_qs.filter(school_id=school_id)
            payments_qs = payments_qs.filter(school_id=school_id)

        if academic_year:
            students_qs = students_qs.filter(Q(academic_year=academic_year) | Q(academic_year=''))
            payments_qs = payments_qs.filter(academic_year=academic_year)

        # 1. Total Invoiced & Student Fee Totals
        total_invoiced = 0.0
        total_collected = 0.0
        student_summaries = []

        for st in students_qs:
            summ = get_student_fee_summary(st, academic_year=academic_year)
            if summ:
                total_invoiced += float(summ.get('totalFees', 0))
                total_collected += float(summ.get('totalPaid', 0))
                student_summaries.append(summ)

        # Also verify against FeePayment direct sum if higher
        payment_direct_sum = sum(float(p.amount_paid) for p in payments_qs)
        if payment_direct_sum > total_collected:
            total_collected = payment_direct_sum

        pending_receivables = max(0.0, total_invoiced - total_collected)
        collection_rate = round((total_collected / total_invoiced * 100), 1) if total_invoiced > 0 else 0

        # 2. Monthly Revenue breakdown (from FeePayment records)
        monthly_distribution = {
            'Jan': 0.0, 'Feb': 0.0, 'Mar': 0.0, 'Apr': 0.0,
            'May': 0.0, 'Jun': 0.0, 'Jul': 0.0, 'Aug': 0.0,
            'Sep': 0.0, 'Oct': 0.0, 'Nov': 0.0, 'Dec': 0.0,
        }
        month_keys = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        for p in payments_qs:
            if p.payment_date:
                m_idx = p.payment_date.month - 1
                if 0 <= m_idx < 12:
                    monthly_distribution[month_keys[m_idx]] += float(p.amount_paid)

        # If payments exist in payment_history of StudentFeeRecord, also aggregate if not in FeePayment
        if not any(monthly_distribution.values()) and total_collected > 0:
            current_m = datetime.date.today().month - 1
            monthly_distribution[month_keys[current_m]] = total_collected

        monthly_chart = [
            {'month': m, 'amount': monthly_distribution[m]}
            for m in month_keys
        ]

        # 3. Recent Transactions / Payments
        recent_payments = []
        for p in payments_qs.order_by('-payment_date', '-created_at')[:10]:
            recent_payments.append({
                'id': p.id,
                'receiptNo': p.receipt_no,
                'studentName': p.student.name if p.student else 'Student',
                'admissionNo': p.student.admission_no if p.student else '',
                'amountPaid': float(p.amount_paid),
                'paymentDate': str(p.payment_date),
                'paymentMethod': p.payment_method,
                'category': p.category,
            })

        return Response({
            'totalRevenue': total_collected,
            'totalInvoiced': total_invoiced,
            'pendingReceivables': pending_receivables,
            'collectionRate': collection_rate,
            'monthlyDistribution': monthly_chart,
            'recentPayments': recent_payments,
            'studentsCount': len(student_summaries),
            'lastUpdated': datetime.datetime.now().isoformat(),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='record-student-payment')
    def record_student_payment(self, request):
        """Records an actual payment transaction in the database for a student."""
        user = request.user
        school_id = getattr(user, 'school_id', None)
        student_id = request.data.get('student_id') or request.data.get('studentId')
        amount_paid = request.data.get('amount_paid') or request.data.get('amountPaid')
        payment_method = request.data.get('payment_method') or request.data.get('paymentMethod', 'Cash')
        category = request.data.get('category', 'School Fee Payment')
        installment_type = request.data.get('installment_type') or request.data.get('installmentType', 'Custom')
        quarter_id = request.data.get('quarter_id') or request.data.get('quarterId')

        if not student_id:
            return Response({'error': 'student_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not amount_paid or float(amount_paid) <= 0:
            return Response({'error': 'A valid positive amount_paid is required'}, status=status.HTTP_400_BAD_REQUEST)

        st_qs = Student.objects.all().select_related('section_record__class_room', 'school')
        if school_id and (not user.is_authenticated or user.role != User.Role.SUPER_ADMIN):
            st_qs = st_qs.filter(school_id=school_id)

        student = None
        if str(student_id).isdigit():
            student = st_qs.filter(pk=student_id).first()
        if not student:
            student = st_qs.filter(admission_no=student_id).first()

        if not student:
            return Response({'error': f'Student with ID {student_id} not found'}, status=status.HTTP_404_NOT_FOUND)

        import time, random
        receipt_no = f"RCPT-2026-{random.randint(100, 999)}"
        transaction_id = f"TXN-{payment_method.upper().replace(' ', '')}-{random.randint(10000, 99999)}"
        today_str = datetime.date.today().isoformat()

        # Find or create StudentFeeRecord
        fee_rec, _ = StudentFeeRecord.objects.get_or_create(
            student=student,
            defaults={
                'school': student.school,
                'student_id_str': str(student.id),
                'student_name': student.name,
                'admission_no': student.admission_no,
                'class_name': student.class_name,
                'section_name': student.section,
                'academic_year': student.academic_year or '2026-2027',
            }
        )

        quarter_obj = None
        if quarter_id and str(quarter_id).isdigit():
            quarter_obj = FeeQuarter.objects.filter(pk=quarter_id).first()

        fs = resolve_fee_structure_for_student(student, school_id=student.school_id)

        payment_obj = FeePayment.objects.create(
            school=student.school,
            fee_record=fee_rec,
            student=student,
            fee_structure=quarter_obj.fee_structure if quarter_obj else fs,
            quarter=quarter_obj,
            academic_year=student.academic_year or '2026-2027',
            payment_date=today_str,
            amount_paid=float(amount_paid),
            payment_method=payment_method,
            transaction_id=transaction_id,
            receipt_no=receipt_no,
            category=category,
            installment_type=installment_type,
        )

        # Update JSON payment history in StudentFeeRecord
        history = list(fee_rec.payment_history or [])
        history.insert(0, {
            'id': f"p-{payment_obj.id}",
            'paymentDate': today_str,
            'amountPaid': float(amount_paid),
            'paymentMethod': payment_method,
            'transactionId': transaction_id,
            'receiptNo': receipt_no,
            'category': category,
            'installmentType': installment_type,
            'quarterId': quarter_id,
        })
        fee_rec.payment_history = history
        fee_rec.save()

        summary = get_student_fee_summary(student)

        return Response({
            'message': 'Student payment recorded successfully',
            'payment': FeePaymentSerializer(payment_obj).data,
            'summary': summary,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='by-teacher')
    def by_teacher(self, request):
        user = request.user
        from apps.staff.models import Teacher
        teacher = None
        if user.is_authenticated and hasattr(user, 'teacher_profile'):
            teacher = user.teacher_profile
        elif request.query_params.get('teacher_id'):
            teacher = Teacher.objects.filter(pk=request.query_params.get('teacher_id')).first()

        if not teacher:
            return Response([])

        section_ids = list(teacher.sections.values_list('id', flat=True))
        class_ids = list(teacher.sections.values_list('class_room_id', flat=True))
        teaching_section_ids = list(teacher.teaching_assignments.values_list('section_id', flat=True))
        teaching_class_ids = list(teacher.teaching_assignments.values_list('section__class_room_id', flat=True))

        all_section_ids = set(section_ids + teaching_section_ids)
        all_class_ids = set(class_ids + teaching_class_ids)

        qs = self.get_queryset().filter(
            Q(level='class', target_class_ref_id__in=all_class_ids) |
            Q(level='section', target_section_ref_id__in=all_section_ids) |
            Q(level='school')
        ).distinct()
        return Response(FeeStructureSerializer(qs, many=True).data)


class FeeQuarterViewSet(TenantScopedViewSet):
    school_field = 'fee_structure__school'
    queryset = FeeQuarter.objects.select_related('fee_structure').all().order_by('quarter_number')
    serializer_class = FeeQuarterSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        academic_year = self.request.query_params.get('academic_year')
        target_class = self.request.query_params.get('target_class')
        target_class_id = self.request.query_params.get('target_class_id')
        fee_structure_id = self.request.query_params.get('fee_structure_id')

        if academic_year:
            qs = qs.filter(academic_year=academic_year)
        if target_class_id:
            qs = qs.filter(fee_structure__target_class_ref_id=target_class_id)
        elif target_class and target_class != 'All':
            clean_cls = re.sub(r'(class|cls)', '', target_class, flags=re.IGNORECASE)
            clean_cls = re.sub(r'[^a-zA-Z0-9]', ' ', clean_cls).strip()
            base_cls = clean_cls.split()[0] if clean_cls else target_class
            qs = qs.filter(
                Q(target_class__icontains=target_class) |
                Q(target_class__icontains=base_cls) |
                Q(target_class__iexact=target_class)
            )
        if fee_structure_id:
            qs = qs.filter(fee_structure_id=fee_structure_id)
        return qs


class StudentFeeRecordViewSet(TenantScopedViewSet):
    serializer_class = StudentFeeRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return StudentFeeRecord.objects.none()
        school_id = getattr(user, 'school_id', None)

        students = Student.objects.all().select_related('school')
        if user.role != User.Role.SUPER_ADMIN:
            if not school_id:
                return StudentFeeRecord.objects.none()
            students = students.filter(school_id=school_id)

        class_name = self.request.query_params.get('class_name')
        class_id = self.request.query_params.get('class_id')
        section_id = self.request.query_params.get('section_id')
        student_id = self.request.query_params.get('student_id')

        if student_id:
            students = students.filter(Q(pk=student_id) if str(student_id).isdigit() else Q(admission_no=student_id))
        if section_id:
            students = students.filter(section_record_id=section_id)
        if class_id:
            students = students.filter(section_record__class_room_id=class_id)
        elif class_name and class_name != 'All':
            clean_cls = class_name.replace('Class', '').replace('class', '').strip(' -_')
            students = students.filter(Q(class_name__icontains=clean_cls) | Q(class_name=class_name))

        for st in students:
            StudentFeeRecord.objects.get_or_create(
                student=st,
                defaults={
                    'school': st.school,
                    'student_id_str': str(st.id),
                    'student_name': st.name,
                    'admission_no': st.admission_no,
                    'class_name': st.class_name,
                    'section_name': st.section,
                    'academic_year': st.academic_year or '2026-2027',
                }
            )

        qs = StudentFeeRecord.objects.filter(student__in=students).order_by('class_name', 'student_name')
        if user.role != User.Role.SUPER_ADMIN and school_id:
            qs = qs.filter(school_id=school_id)
        return qs

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        record = self.get_object()
        amount_paid = request.data.get('amount_paid')
        payment_method = request.data.get('payment_method', 'Cash')
        category = request.data.get('category', 'School Fee Payment')
        installment_type = request.data.get('installment_type', 'Custom')
        quarter_id = request.data.get('quarter_id')

        if not amount_paid or float(amount_paid) <= 0:
            return Response({'error': 'Invalid payment amount'}, status=status.HTTP_400_BAD_REQUEST)

        import time, random
        receipt_no = f"RCPT-2026-{random.randint(100, 999)}"
        transaction_id = f"TXN-{payment_method.upper().replace(' ', '')}-{random.randint(10000, 99999)}"
        today_str = datetime.date.today().isoformat()

        new_payment_dict = {
            'id': f"p-{int(time.time() * 1000)}",
            'paymentDate': today_str,
            'amountPaid': float(amount_paid),
            'paymentMethod': payment_method,
            'transactionId': transaction_id,
            'receiptNo': receipt_no,
            'category': category,
            'installmentType': installment_type,
            'quarterId': quarter_id,
        }

        # Update JSON payment history field
        history = list(record.payment_history or [])
        history.insert(0, new_payment_dict)
        record.payment_history = history
        record.save()

        quarter_obj = None
        if quarter_id and str(quarter_id).isdigit():
            quarter_obj = FeeQuarter.objects.filter(pk=quarter_id).first()

        # Create FeePayment instance
        payment_obj = FeePayment.objects.create(
            school=record.school,
            fee_record=record,
            student=record.student,
            fee_structure=quarter_obj.fee_structure if quarter_obj else None,
            quarter=quarter_obj,
            academic_year=record.academic_year,
            payment_date=today_str,
            amount_paid=amount_paid,
            payment_method=payment_method,
            transaction_id=transaction_id,
            receipt_no=receipt_no,
            category=category,
            installment_type=installment_type,
        )

        summary = None
        if record.student:
            summary = get_student_fee_summary(record.student)

        return Response({
            'message': 'Payment recorded successfully',
            'payment': new_payment_dict,
            'record': StudentFeeRecordSerializer(record).data,
            'summary': summary,
        }, status=status.HTTP_201_CREATED)


class FeePaymentViewSet(TenantScopedViewSet):
    queryset = FeePayment.objects.all().order_by('-payment_date', '-created_at')
    serializer_class = FeePaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
