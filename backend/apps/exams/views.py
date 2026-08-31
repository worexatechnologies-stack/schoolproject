from math import isfinite

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiResponse, extend_schema

from apps.accounts.models import User
from apps.common.tenancy import TenantScopedViewSet
from apps.notifications.models import Notification
from apps.sis.models import Student
from apps.staff.models import Teacher
from .models import Exam, ExamResult, ExamSchedule, ExamScheduleItem
from .serializers import (
    ExamResultSerializer,
    ExamSerializer,
    ExamScheduleSerializer,
    ExamScheduleItemSerializer,
)


class ExamSchedulePermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return request.user.role in [
                User.Role.SCHOOL_ADMIN,
                User.Role.TEACHER,
                User.Role.PARENT,
                User.Role.STUDENT,
                User.Role.SUPER_ADMIN,
            ]
        if getattr(view, 'action', None) in ['save_marks_sheet']:
            return request.user.role in [
                User.Role.SCHOOL_ADMIN,
                User.Role.SUPER_ADMIN,
                User.Role.TEACHER,
            ]
        return request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]


class ExamScheduleViewSet(TenantScopedViewSet):
    """Tenant-scoped exam schedule CRUD and publish/unpublish lifecycle actions."""
    queryset = ExamSchedule.objects.select_related('school', 'classroom').prefetch_related('items').order_by('-created_at')
    serializer_class = ExamScheduleSerializer
    permission_classes = [ExamSchedulePermission]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in [User.Role.SUPER_ADMIN, User.Role.SCHOOL_ADMIN]:
            return qs

        # Non-admins can only see PUBLISHED schedules
        qs = qs.filter(status=ExamSchedule.Status.PUBLISHED)

        if user.role == User.Role.TEACHER:
            return qs

        if user.role == User.Role.STUDENT:
            profile = getattr(user, 'student_profile', None)
            if not profile or profile.student.school_id != user.school_id:
                return qs.none()
            student = profile.student
            if student.section_record and student.section_record.class_room_id:
                return qs.filter(
                    Q(classroom_id=student.section_record.class_room_id)
                    | Q(class_name__iexact=student.class_name)
                )
            return qs.filter(class_name__iexact=student.class_name)

        if user.role == User.Role.PARENT:
            profile = getattr(user, 'parent_profile', None)
            if not profile:
                return qs.none()
            parent_students = profile.students.filter(school_id=user.school_id)
            class_ids = parent_students.filter(
                section_record__class_room__isnull=False
            ).values_list('section_record__class_room_id', flat=True)
            class_names = parent_students.values_list('class_name', flat=True)
            return qs.filter(
                Q(classroom_id__in=class_ids) | Q(class_name__in=class_names)
            ).distinct()

        return qs.none()

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    @action(detail=True, methods=['post'], url_path='publish')
    def publish(self, request, pk=None):
        schedule = self.get_object()
        if request.user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        items = schedule.items.all()
        if not items.exists():
            return Response(
                {'detail': 'Cannot publish an empty exam timetable. Add at least one subject.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        errors = []
        for item in items:
            if not item.exam_date:
                errors.append(f"{item.subject_name}: Exam date is required.")
            if not item.start_time:
                errors.append(f"{item.subject_name}: Start time is required.")
            if not item.end_time:
                errors.append(f"{item.subject_name}: End time is required.")
            elif item.start_time and item.end_time <= item.start_time:
                errors.append(f"{item.subject_name}: End time must be later than start time.")
            if not item.max_marks or item.max_marks < 1:
                errors.append(f"{item.subject_name}: Maximum marks must be at least 1.")

        if errors:
            return Response(
                {'detail': 'Validation failed before publishing.', 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule.status = ExamSchedule.Status.PUBLISHED
        schedule.published_at = timezone.now()
        schedule.save()

        # Synchronize / create Exam records for all sections of this class
        sections = schedule.classroom.sections.filter(school=schedule.school)
        section_names = list(sections.values_list('name', flat=True)) if sections.exists() else ['A']

        for sec_name in section_names:
            for item in items:
                Exam.objects.update_or_create(
                    school=schedule.school,
                    name=schedule.name,
                    class_name=schedule.class_name,
                    section=sec_name,
                    subject=item.subject_name,
                    defaults={
                        'schedule': schedule,
                        'date': item.exam_date,
                        'time': item.start_time,
                        'end_time': item.end_time,
                        'max_marks': item.max_marks,
                    },
                )

        # Broadcast notification specifically to Students, Parents, and Teachers related to this class
        class_students = Student.objects.filter(
            school=schedule.school,
            status=Student.Status.ACTIVE,
        ).filter(
            Q(section_record__class_room=schedule.classroom) |
            Q(class_name__iexact=schedule.class_name)
        )

        student_user_ids = list(class_students.filter(login_profile__isnull=False).values_list('login_profile__user_id', flat=True))
        parent_user_ids = list(User.objects.filter(parent_profile__students__in=class_students).values_list('id', flat=True).distinct())
        teacher_user_ids = list(User.objects.filter(teacher_profile__sections__class_room=schedule.classroom, teacher_profile__school=schedule.school).values_list('id', flat=True).distinct())

        all_target_ids = set(student_user_ids + parent_user_ids + teacher_user_ids)
        recipients = User.objects.filter(id__in=all_target_ids)

        student_names = list(class_students.values_list('name', flat=True)[:10])
        student_ids = list(class_students.values_list('id', flat=True))

        Notification.objects.bulk_create([
            Notification(
                school=schedule.school,
                sender=request.user,
                recipient=u,
                channel='exam-schedule',
                category='Academic',
                title=f'Exam Timetable Published: {schedule.name}',
                body=f'Official exam timetable for {schedule.class_name} ({schedule.name}) is now published with {items.count()} subjects.',
                related_object={
                    'schedule_id': schedule.id,
                    'class_name': schedule.class_name,
                    'targetClass': schedule.class_name,
                    'studentNames': student_names,
                    'studentIds': student_ids,
                },
            )
            for u in recipients
        ])

        return Response(ExamScheduleSerializer(schedule, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='unpublish')
    def unpublish(self, request, pk=None):
        schedule = self.get_object()
        if request.user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        schedule.status = ExamSchedule.Status.DRAFT
        schedule.hall_tickets_released = False
        schedule.save()
        return Response(ExamScheduleSerializer(schedule, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='generate-hall-tickets')
    def generate_hall_tickets(self, request, pk=None):
        schedule = self.get_object()
        if request.user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Only school administrators can generate hall tickets.'}, status=status.HTTP_403_FORBIDDEN)

        if schedule.status != ExamSchedule.Status.PUBLISHED:
            return Response(
                {'detail': 'Exam schedule must be published before generating hall tickets.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule.hall_tickets_generated = True
        schedule.save(update_fields=['hall_tickets_generated', 'updated_at'])

        class_students_count = Student.objects.filter(
            school=schedule.school,
            status=Student.Status.ACTIVE,
        ).filter(
            Q(section_record__class_room=schedule.classroom) |
            Q(class_name__iexact=schedule.class_name)
        ).count()

        return Response({
            'detail': f'Hall tickets generated for {class_students_count} active students in {schedule.class_name}. Ready for administrator review and distribution.',
            'count': class_students_count,
            'schedule': ExamScheduleSerializer(schedule, context={'request': request}).data,
        })

    @action(detail=True, methods=['post'], url_path='release-hall-tickets')
    def release_hall_tickets(self, request, pk=None):
        schedule = self.get_object()
        if request.user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Only school administrators can approve and release hall tickets.'}, status=status.HTTP_403_FORBIDDEN)

        if schedule.status != ExamSchedule.Status.PUBLISHED:
            return Response(
                {'detail': 'Exam schedule must be published before releasing hall tickets.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule.hall_tickets_generated = True
        schedule.hall_tickets_released = True
        schedule.hall_tickets_released_at = timezone.now()
        schedule.save(update_fields=['hall_tickets_generated', 'hall_tickets_released', 'hall_tickets_released_at', 'updated_at'])

        # Notify Students and Parents ONLY (Not teachers)
        class_students = Student.objects.filter(
            school=schedule.school,
            status=Student.Status.ACTIVE,
        ).filter(
            Q(section_record__class_room=schedule.classroom) |
            Q(class_name__iexact=schedule.class_name)
        )

        student_user_ids = list(class_students.filter(login_profile__isnull=False).values_list('login_profile__user_id', flat=True))
        parent_user_ids = list(User.objects.filter(parent_profile__students__in=class_students).values_list('id', flat=True).distinct())

        target_recipient_ids = set(student_user_ids + parent_user_ids)
        recipients = User.objects.filter(id__in=target_recipient_ids)

        student_names = list(class_students.values_list('name', flat=True)[:10])
        student_ids = list(class_students.values_list('id', flat=True))

        Notification.objects.bulk_create([
            Notification(
                school=schedule.school,
                sender=request.user,
                recipient=u,
                channel='exam-hallticket',
                category='Academic',
                title=f'Official Hall Tickets Released: {schedule.name}',
                body=f'Official exam admit cards / hall tickets for {schedule.class_name} ({schedule.name}) have been approved and released by administration.',
                related_object={
                    'schedule_id': schedule.id,
                    'class_name': schedule.class_name,
                    'targetClass': schedule.class_name,
                    'hall_ticket_released': True,
                    'studentNames': student_names,
                    'studentIds': student_ids,
                },
            )
            for u in recipients
        ])

        return Response({
            'detail': f'Hall tickets approved and released to {len(student_user_ids)} students and {len(parent_user_ids)} parents.',
            'released_at': schedule.hall_tickets_released_at,
            'schedule': ExamScheduleSerializer(schedule, context={'request': request}).data,
        })

    @action(detail=True, methods=['get'], url_path='hall-tickets')
    def get_hall_tickets(self, request, pk=None):
        schedule = self.get_object()
        user = request.user

        if user.role == User.Role.TEACHER:
            return Response(
                {'detail': 'Hall tickets are distributed directly to students and parents only.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        items = list(schedule.items.all().order_by('exam_date', 'start_time'))

        # Helper to construct hall ticket payload for a student
        def build_ticket(student):
            papers = [
                {
                    'subject_name': it.subject_name,
                    'exam_date': str(it.exam_date),
                    'start_time': str(it.start_time)[:5] if it.start_time else '',
                    'end_time': str(it.end_time)[:5] if it.end_time else '',
                    'max_marks': it.max_marks,
                    'room_number': getattr(student.section_record, 'room_number', '') or (f"Room {student.section}" if student.section else 'Main Hall'),
                }
                for it in items
            ]
            return {
                'id': f"HT-{schedule.id}-{student.id}",
                'hall_ticket_no': f"HT/{student.academic_year or '2026'}/{schedule.id}/{student.roll_no or student.id:03d}",
                'schedule_id': schedule.id,
                'exam_name': schedule.name,
                'academic_year': schedule.academic_year or '2026-2027',
                'class_name': student.class_name or schedule.class_name,
                'section': student.section or (student.section_record.name if student.section_record else 'A'),
                'student_id': student.id,
                'student_name': student.name,
                'admission_no': student.admission_no,
                'roll_no': student.roll_no or student.id,
                'parent_name': student.parent_name or getattr(student, 'father_name', '') or getattr(student, 'mother_name', ''),
                'photo_url': getattr(student, 'photo_url', '') or '',
                'emergency_contact': student.parent_phone or '',
                'papers': papers,
                'status': 'released' if schedule.hall_tickets_released else ('pending_approval' if schedule.hall_tickets_generated else 'draft'),
                'is_released': schedule.hall_tickets_released,
                'released_at': schedule.hall_tickets_released_at,
                'instructions': [
                    '1. Candidates must arrive at the examination hall at least 15 minutes before the scheduled start time.',
                    '2. Carrying this Hall Ticket / Admit Card and the valid Student ID is strictly mandatory for admission.',
                    '3. Electronic gadgets including mobile phones, smartwatches, and programmable calculators are strictly prohibited.',
                    '4. Follow all instructions given by the invigilator and maintain absolute silence in the examination room.',
                ],
            }

        # For Admin: Return all students in class
        if user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            class_students = Student.objects.filter(
                school=schedule.school,
                status=Student.Status.ACTIVE,
            ).filter(
                Q(section_record__class_room=schedule.classroom) |
                Q(class_name__iexact=schedule.class_name)
            ).select_related('section_record').order_by('roll_no', 'name')

            tickets = [build_ticket(s) for s in class_students]
            return Response({
                'status': 'released' if schedule.hall_tickets_released else ('pending_approval' if schedule.hall_tickets_generated else 'draft'),
                'is_released': schedule.hall_tickets_released,
                'released_at': schedule.hall_tickets_released_at,
                'schedule_id': schedule.id,
                'schedule_name': schedule.name,
                'class_name': schedule.class_name,
                'hall_tickets': tickets,
            })

        # For Student:
        if user.role == User.Role.STUDENT:
            if not schedule.hall_tickets_released:
                return Response({
                    'status': 'pending_approval',
                    'is_released': False,
                    'message': f'Hall tickets for {schedule.name} ({schedule.class_name}) are awaiting administrator approval and distribution.',
                    'hall_tickets': [],
                })
            profile = getattr(user, 'student_profile', None)
            if not profile or profile.student.school_id != schedule.school_id:
                return Response({'status': 'not_found', 'is_released': False, 'hall_tickets': []})
            tickets = [build_ticket(profile.student)]
            return Response({
                'status': 'released',
                'is_released': True,
                'released_at': schedule.hall_tickets_released_at,
                'hall_tickets': tickets,
            })

        # For Parent:
        if user.role == User.Role.PARENT:
            if not schedule.hall_tickets_released:
                return Response({
                    'status': 'pending_approval',
                    'is_released': False,
                    'message': f'Hall tickets for {schedule.name} ({schedule.class_name}) are awaiting administrator approval and distribution.',
                    'hall_tickets': [],
                })
            profile = getattr(user, 'parent_profile', None)
            if not profile:
                return Response({'status': 'not_found', 'is_released': False, 'hall_tickets': []})
            parent_students = profile.students.filter(
                school_id=schedule.school_id,
                status=Student.Status.ACTIVE,
            ).filter(
                Q(section_record__class_room=schedule.classroom) |
                Q(class_name__iexact=schedule.class_name)
            ).select_related('section_record').order_by('name')

            tickets = [build_ticket(s) for s in parent_students]
            return Response({
                'status': 'released',
                'is_released': True,
                'released_at': schedule.hall_tickets_released_at,
                'hall_tickets': tickets,
            })

        return Response({'status': 'forbidden', 'is_released': False, 'hall_tickets': []}, status=status.HTTP_403_FORBIDDEN)

    @action(detail=True, methods=['get'], url_path='marks-sheet')
    def get_marks_sheet(self, request, pk=None):
        schedule = self.get_object()
        user = request.user
        is_admin = user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]
        is_teacher = user.role == User.Role.TEACHER

        if not is_admin and not is_teacher:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        teacher_subject_names = set()
        teacher_sections = []
        if is_teacher:
            teacher = Teacher.objects.filter(user=user, school_id=user.school_id, status=Teacher.Status.ACTIVE).first()
            if not teacher:
                return Response({'detail': 'Teacher profile not found or inactive.'}, status=status.HTTP_403_FORBIDDEN)
            
            teacher_subject_names.update(teacher.subject_records.filter(school_id=user.school_id).values_list('name', flat=True))
            teacher_subject_names.update(teacher.teaching_assignments.filter(school_id=user.school_id).values_list('subject__name', flat=True))
            if isinstance(teacher.subjects, list):
                teacher_subject_names.update([str(s).strip() for s in teacher.subjects if str(s).strip()])

            teacher_sections.extend(list(teacher.sections.filter(school_id=user.school_id, class_room=schedule.classroom).values_list('name', flat=True)))
            teacher_sections.extend(list(teacher.teaching_assignments.filter(school_id=user.school_id, section__class_room=schedule.classroom).values_list('section__name', flat=True)))
            if isinstance(teacher.assigned_sections, list):
                teacher_sections.extend([str(sec).strip() for sec in teacher.assigned_sections if str(sec).strip()])
            teacher_sections = list(dict.fromkeys([s for s in teacher_sections if s]))

        teacher_subs_lower = {s.lower() for s in teacher_subject_names}

        # Available sections
        all_sections = list(schedule.classroom.sections.filter(school_id=schedule.school_id).values_list('name', flat=True)) if schedule.classroom else []
        if not all_sections:
            all_sections = ['A']

        active_sections = all_sections if is_admin else (teacher_sections if teacher_sections else all_sections)

        requested_section = request.query_params.get('section', '').strip()
        if requested_section and requested_section in all_sections:
            target_section = requested_section
        else:
            target_section = active_sections[0] if active_sections else 'A'

        # Schedule items (Subjects in this exam)
        items = list(schedule.items.all().order_by('order', 'exam_date', 'start_time'))

        # Ensure Exam objects exist for this section and subjects
        for item in items:
            Exam.objects.get_or_create(
                school=schedule.school,
                schedule=schedule,
                name=schedule.name,
                class_name=schedule.class_name,
                section=target_section,
                subject=item.subject_name,
                defaults={
                    'date': item.exam_date,
                    'time': item.start_time,
                    'end_time': item.end_time,
                    'max_marks': item.max_marks,
                },
            )

        # Active students in this class section
        students = Student.objects.filter(
            school_id=schedule.school_id,
            status=Student.Status.ACTIVE,
        ).filter(
            Q(section_record__class_room=schedule.classroom, section_record__name__iexact=target_section) |
            Q(class_name__iexact=schedule.class_name, section__iexact=target_section)
        ).order_by('roll_no', 'name')

        # Existing results
        results = ExamResult.objects.filter(
            exam__schedule=schedule,
            exam__section__iexact=target_section,
        ).select_related('exam')

        result_map = {}
        for r in results:
            result_map[(r.student_id, r.exam.subject)] = r

        subjects_payload = []
        for it in items:
            can_edit = is_admin or (it.subject_name.lower() in teacher_subs_lower)
            subjects_payload.append({
                'subject_name': it.subject_name,
                'max_marks': it.max_marks,
                'can_edit': can_edit,
            })

        student_rows = []
        for s in students:
            student_marks = {}
            for it in items:
                res = result_map.get((s.id, it.subject_name))
                can_edit = is_admin or (it.subject_name.lower() in teacher_subs_lower)
                student_marks[it.subject_name] = {
                    'marks_obtained': res.marks_obtained if res and res.marks_obtained is not None else '',
                    'remarks': res.remarks if res else '',
                    'status': res.status if res else 'draft',
                    'can_edit': can_edit,
                }
            student_rows.append({
                'student_id': s.id,
                'student_name': s.name,
                'admission_no': s.admission_no,
                'roll_no': s.roll_no or s.id,
                'photo_url': getattr(s, 'photo_url', '') or '',
                'marks': student_marks,
            })

        all_published = results.exists() and not results.filter(status=ExamResult.Status.DRAFT).exists()

        return Response({
            'schedule_id': schedule.id,
            'schedule_name': schedule.name,
            'class_name': schedule.class_name,
            'academic_year': schedule.academic_year,
            'section': target_section,
            'sections': active_sections,
            'all_sections': all_sections,
            'subjects': subjects_payload,
            'students': student_rows,
            'is_admin': is_admin,
            'all_published': all_published,
            'teacher_subjects': list(teacher_subject_names) if is_teacher else [],
        })

    @action(detail=True, methods=['post'], url_path='save-marks-sheet')
    def save_marks_sheet(self, request, pk=None):
        schedule = self.get_object()
        user = request.user
        is_admin = user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]
        is_teacher = user.role == User.Role.TEACHER

        if not is_admin and not is_teacher:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)

        teacher_subject_names = set()
        teacher_sections = []
        if is_teacher:
            teacher = Teacher.objects.filter(user=user, school_id=user.school_id, status=Teacher.Status.ACTIVE).first()
            if not teacher:
                return Response({'detail': 'Teacher profile not found.'}, status=status.HTTP_403_FORBIDDEN)
            teacher_subject_names.update(teacher.subject_records.filter(school_id=user.school_id).values_list('name', flat=True))
            teacher_subject_names.update(teacher.teaching_assignments.filter(school_id=user.school_id).values_list('subject__name', flat=True))
            if isinstance(teacher.subjects, list):
                teacher_subject_names.update([str(s).strip() for s in teacher.subjects if str(s).strip()])

            teacher_sections.extend(list(teacher.sections.filter(school_id=user.school_id, class_room=schedule.classroom).values_list('name', flat=True)))
            teacher_sections.extend(list(teacher.teaching_assignments.filter(school_id=user.school_id, section__class_room=schedule.classroom).values_list('section__name', flat=True)))
            if isinstance(teacher.assigned_sections, list):
                teacher_sections.extend([str(sec).strip() for sec in teacher.assigned_sections if str(sec).strip()])
            teacher_sections = list(dict.fromkeys([s for s in teacher_sections if s]))

        teacher_subs_lower = {s.lower() for s in teacher_subject_names}

        section_name = request.data.get('section', 'A')
        target_status = request.data.get('status', 'draft')
        entries = request.data.get('entries', [])

        if is_teacher and teacher_sections and section_name not in teacher_sections:
            return Response({'detail': f'You are not assigned to Section {section_name}.'}, status=status.HTTP_403_FORBIDDEN)

        updated_count = 0
        for entry in entries:
            student_id = entry.get('student_id')
            subject_name = entry.get('subject_name', '')
            raw_marks = entry.get('marks_obtained')
            remarks = entry.get('remarks', '')

            if not student_id or not subject_name:
                continue

            if is_teacher and subject_name.lower() not in teacher_subs_lower:
                continue

            exam = Exam.objects.filter(
                schedule=schedule,
                section__iexact=section_name,
                subject__iexact=subject_name,
            ).first()

            if not exam:
                continue

            marks_val = None
            if raw_marks is not None and str(raw_marks).strip() != '':
                try:
                    m = float(raw_marks)
                    if 0 <= m <= exam.max_marks:
                        marks_val = m
                except (ValueError, TypeError):
                    marks_val = None

            result, _ = ExamResult.objects.get_or_create(
                exam=exam,
                student_id=student_id,
                defaults={'school': schedule.school, 'entered_by': user}
            )

            result.marks_obtained = marks_val
            result.remarks = remarks or ''
            result.status = target_status
            result.entered_by = user
            if target_status == ExamResult.Status.SUBMITTED:
                result.submitted_at = timezone.now()
            result.save()
            updated_count += 1

        return Response({
            'detail': f'Marks successfully saved for {updated_count} entries.',
            'updated': updated_count,
        })

    @action(detail=True, methods=['post'], url_path='publish-marks-sheet')
    def publish_marks_sheet(self, request, pk=None):
        schedule = self.get_object()
        user = request.user
        if user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Only school administrators can verify and publish marks.'}, status=status.HTTP_403_FORBIDDEN)

        section_name = request.data.get('section', '')
        qs = ExamResult.objects.filter(exam__schedule=schedule)
        if section_name:
            qs = qs.filter(exam__section__iexact=section_name)

        now = timezone.now()
        updated = qs.update(status=ExamResult.Status.SUBMITTED, submitted_at=now)

        schedule.marks_published = True
        schedule.marks_published_at = now
        schedule.save(update_fields=['marks_published', 'marks_published_at', 'updated_at'])

        return Response({
            'detail': f'Marks for {schedule.name} ({schedule.class_name} {section_name}) have been verified and published. You can now generate official report cards.',
            'updated': updated,
            'marks_published': True,
        })

    @action(detail=True, methods=['post'], url_path='generate-report-cards')
    def generate_report_cards(self, request, pk=None):
        schedule = self.get_object()
        user = request.user
        if user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Only school administrators can generate report cards.'}, status=status.HTTP_403_FORBIDDEN)

        if not schedule.marks_published:
            return Response(
                {'detail': 'Cannot generate report cards. The administrator must first verify and publish marks for this examination.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule.report_cards_generated = True
        schedule.save(update_fields=['report_cards_generated', 'updated_at'])

        return Response({
            'detail': f'Report cards successfully generated for {schedule.name} ({schedule.class_name}). Ready for administrator verification and publishing to students and parents.',
            'schedule_id': schedule.id,
            'report_cards_generated': True,
        })

    @action(detail=True, methods=['post'], url_path='publish-report-cards')
    def publish_report_cards(self, request, pk=None):
        schedule = self.get_object()
        user = request.user
        if user.role not in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return Response({'detail': 'Only school administrators can publish official report cards.'}, status=status.HTTP_403_FORBIDDEN)

        if not schedule.marks_published:
            return Response(
                {'detail': 'Cannot publish report cards. Examination marks must first be verified and published.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not schedule.report_cards_generated:
            return Response(
                {'detail': 'Cannot publish report cards. Report cards must first be generated by clicking "Generate Report Cards".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule.report_cards_published = True
        schedule.report_cards_published_at = timezone.now()
        schedule.save(update_fields=['report_cards_published', 'report_cards_published_at', 'updated_at'])

        # Set all linked exam results to submitted
        ExamResult.objects.filter(exam__schedule=schedule).update(
            status=ExamResult.Status.SUBMITTED,
            submitted_at=timezone.now(),
        )

        # Notify Students and Parents ONLY (NOT teachers)
        class_students = Student.objects.filter(
            school=schedule.school,
            status=Student.Status.ACTIVE,
        ).filter(
            Q(section_record__class_room=schedule.classroom) |
            Q(class_name__iexact=schedule.class_name)
        )

        parent_users = list(User.objects.filter(parent_profile__students__in=class_students).distinct())
        student_users = list(User.objects.filter(login_profile__student__in=class_students).distinct())

        target_recipients = set(parent_users + student_users)

        student_names = list(class_students.values_list('name', flat=True)[:10])
        student_ids = list(class_students.values_list('id', flat=True))

        Notification.objects.bulk_create([
            Notification(
                school=schedule.school,
                sender=request.user,
                recipient=u,
                channel='exam-result',
                category='Academic',
                title=f'Official Report Cards Published: {schedule.name}',
                body=f'Official terminal examination report cards for {schedule.class_name} ({schedule.name}) have been verified and published by the administration. You can now view and download your official grade card.',
                related_object={
                    'schedule_id': schedule.id,
                    'class_name': schedule.class_name,
                    'targetClass': schedule.class_name,
                    'report_cards_published': True,
                    'studentNames': student_names,
                    'studentIds': student_ids,
                },
            )
            for u in target_recipients
        ])

        return Response({
            'detail': f'Official report cards for {schedule.name} ({schedule.class_name}) have been approved and published to {len(student_users)} students and {len(parent_users)} parents.',
            'published_at': schedule.report_cards_published_at,
            'schedule': ExamScheduleSerializer(schedule, context={'request': request}).data,
        })

    @action(detail=True, methods=['get'], url_path='report-cards')
    def get_report_cards(self, request, pk=None):
        schedule = self.get_object()
        user = request.user

        if user.role == User.Role.TEACHER:
            return Response(
                {'detail': 'Report cards are distributed directly to students and parents only.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        items = list(schedule.items.all().order_by('order', 'exam_date', 'start_time'))
        results = ExamResult.objects.filter(exam__schedule=schedule).select_related('exam')
        result_map = {(r.student_id, r.exam.subject): r for r in results}

        def compute_grade_letter(pct):
            if pct >= 90: return 'A+'
            if pct >= 80: return 'A'
            if pct >= 70: return 'B+'
            if pct >= 60: return 'B'
            if pct >= 50: return 'C+'
            if pct >= 40: return 'C'
            return 'F'

        def build_card(student, rank_num=1, total_count=1):
            papers = []
            tot_obt = 0
            tot_max = 0
            all_pass = True

            for it in items:
                res = result_map.get((student.id, it.subject_name))
                m_val = res.marks_obtained if res and res.marks_obtained is not None else 0
                m_num = float(m_val) if m_val is not None else 0
                max_m = it.max_marks or 100
                pct = round((m_num / max_m) * 100, 1) if max_m > 0 else 0
                grd = compute_grade_letter(pct)
                if pct < 40:
                    all_pass = False
                tot_obt += m_num
                tot_max += max_m

                papers.append({
                    'subject_name': it.subject_name,
                    'max_marks': max_m,
                    'marks_obtained': m_num if res and res.marks_obtained is not None else 0,
                    'percentage': pct,
                    'grade': grd,
                    'remarks': res.remarks if res else '',
                })

            ov_pct = round((tot_obt / tot_max) * 100, 1) if tot_max > 0 else 0
            ov_grd = compute_grade_letter(ov_pct)
            gpa = round(ov_pct / 9.5, 2) if ov_pct > 0 else 0.0

            return {
                'id': f"RC-{schedule.id}-{student.id}",
                'report_card_no': f"RC/{student.academic_year or '2026'}/{schedule.id}/{student.roll_no or student.id:03d}",
                'schedule_id': schedule.id,
                'exam_name': schedule.name,
                'academic_year': schedule.academic_year or '2026-2027',
                'class_name': student.class_name or schedule.class_name,
                'section': student.section or (student.section_record.name if student.section_record else 'A'),
                'student_id': student.id,
                'student_name': student.name,
                'admission_no': student.admission_no,
                'roll_no': student.roll_no or student.id,
                'parent_name': student.parent_name or getattr(student, 'father_name', '') or getattr(student, 'mother_name', ''),
                'photo_url': getattr(student, 'photo_url', '') or '',
                'papers': papers,
                'total_obtained': tot_obt,
                'total_max': tot_max,
                'percentage': ov_pct,
                'grade': ov_grd,
                'gpa': min(gpa, 10.0),
                'result_status': 'PASSED' if all_pass else 'PROMOTED / NEEDS IMPROVEMENT',
                'rank': rank_num,
                'total_candidates': total_count,
                'status': 'published' if schedule.report_cards_published else ('generated' if schedule.report_cards_generated else 'draft'),
                'is_published': schedule.report_cards_published,
                'published_at': schedule.report_cards_published_at,
                'conduct_remarks': 'Exemplary conduct, consistent academic diligence and positive classroom participation.',
            }

        # For Admin
        if user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            if not schedule.report_cards_generated and not schedule.report_cards_published:
                return Response({
                    'status': 'not_generated',
                    'marks_published': schedule.marks_published,
                    'marks_published_at': schedule.marks_published_at,
                    'is_published': False,
                    'is_generated': False,
                    'published_at': None,
                    'schedule_id': schedule.id,
                    'schedule_name': schedule.name,
                    'class_name': schedule.class_name,
                    'report_cards': [],
                })

            class_students = list(Student.objects.filter(
                school=schedule.school,
                status=Student.Status.ACTIVE,
            ).filter(
                Q(section_record__class_room=schedule.classroom) |
                Q(class_name__iexact=schedule.class_name)
            ).select_related('section_record').order_by('roll_no', 'name'))

            # Compute ranks by total marks
            student_scores = []
            for s in class_students:
                tot = sum(
                    float(result_map.get((s.id, it.subject_name)).marks_obtained or 0)
                    if result_map.get((s.id, it.subject_name)) and result_map.get((s.id, it.subject_name)).marks_obtained is not None
                    else 0
                    for it in items
                )
                student_scores.append((tot, s))

            student_scores.sort(key=lambda x: x[0], reverse=True)
            rank_map = {}
            for rank_idx, (tot, s) in enumerate(student_scores, 1):
                rank_map[s.id] = rank_idx

            cards = [build_card(s, rank_map.get(s.id, 1), len(class_students)) for s in class_students]
            return Response({
                'status': 'published' if schedule.report_cards_published else ('generated' if schedule.report_cards_generated else 'draft'),
                'marks_published': schedule.marks_published,
                'marks_published_at': schedule.marks_published_at,
                'is_published': schedule.report_cards_published,
                'is_generated': schedule.report_cards_generated,
                'published_at': schedule.report_cards_published_at,
                'schedule_id': schedule.id,
                'schedule_name': schedule.name,
                'class_name': schedule.class_name,
                'report_cards': cards,
            })

        # For Student
        if user.role == User.Role.STUDENT:
            if not schedule.report_cards_published:
                return Response({
                    'status': 'pending_publishing',
                    'is_published': False,
                    'message': f'Official report cards for {schedule.name} ({schedule.class_name}) are awaiting administrator publishing.',
                    'report_cards': [],
                })
            profile = getattr(user, 'student_profile', None)
            if not profile or profile.student.school_id != schedule.school_id:
                return Response({'status': 'not_found', 'is_published': False, 'report_cards': []})
            card = build_card(profile.student)
            return Response({
                'status': 'published',
                'is_published': True,
                'published_at': schedule.report_cards_published_at,
                'report_cards': [card],
            })

        # For Parent
        if user.role == User.Role.PARENT:
            if not schedule.report_cards_published:
                return Response({
                    'status': 'pending_publishing',
                    'is_published': False,
                    'message': f'Official report cards for {schedule.name} ({schedule.class_name}) are awaiting administrator publishing.',
                    'report_cards': [],
                })
            profile = getattr(user, 'parent_profile', None)
            if not profile:
                return Response({'status': 'not_found', 'is_published': False, 'report_cards': []})
            parent_students = profile.students.filter(
                school_id=schedule.school_id,
                status=Student.Status.ACTIVE,
            ).filter(
                Q(section_record__class_room=schedule.classroom) |
                Q(class_name__iexact=schedule.class_name)
            ).select_related('section_record').order_by('name')

            cards = [build_card(s) for s in parent_students]
            return Response({
                'status': 'published',
                'is_published': True,
                'published_at': schedule.report_cards_published_at,
                'report_cards': cards,
            })

        return Response({'status': 'forbidden', 'is_published': False, 'report_cards': []}, status=status.HTTP_403_FORBIDDEN)


def can_enter(teacher, exam):
    if (
        not teacher
        or teacher.status != Teacher.Status.ACTIVE
        or teacher.school_id != exam.school_id
    ):
        return False
    subject_ok = teacher.subject_records.filter(
        school_id=exam.school_id,
        name=exam.subject,
    ).exists()
    section_ok = teacher.sections.filter(
        school_id=exam.school_id,
        class_room__name=exam.class_name,
        name=exam.section,
    ).exists()
    return subject_ok and section_ok


def _exam_scope_for_section_pairs(queryset, sections):
    scope = Q(pk__in=[])
    for section in sections:
        scope |= Q(class_name=section.class_room.name, section=section.name)
    return queryset.filter(scope)


class ExamPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.TEACHER, User.Role.PARENT, User.Role.STUDENT]
        # Exams and their linked result records are controlled by the school
        # administrator. Teachers can enter results only through the dedicated
        # submit_results action below.
        if view.action == 'submit_results':
            return request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.TEACHER]
        return request.user.role == User.Role.SCHOOL_ADMIN


class ExamViewSet(TenantScopedViewSet):
    """Tenant-scoped exam CRUD plus result actions under one router resource."""
    queryset = Exam.objects.select_related('school').order_by('-date', '-id')
    serializer_class = ExamSerializer
    permission_classes = [ExamPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.TEACHER:
            teacher = Teacher.objects.filter(
                user=user,
                school_id=user.school_id,
                status=Teacher.Status.ACTIVE,
            ).first()
            if not teacher:
                return qs.none()
            sections = teacher.sections.filter(school_id=user.school_id).select_related('class_room')
            subject_names = teacher.subject_records.filter(
                school_id=user.school_id,
            ).values_list('name', flat=True)
            return _exam_scope_for_section_pairs(qs.filter(subject__in=subject_names), sections)
        if user.role == User.Role.STUDENT:
            profile = getattr(user, 'student_profile', None)
            if not profile:
                return qs.none()
            student = profile.student
            # Defense in depth: the profile's student must belong to the
            # caller's tenant even though profile construction is atomic.
            if student.school_id != user.school_id:
                return qs.none()
            return qs.filter(class_name=student.class_name, section=student.section)
        if user.role == User.Role.PARENT:
            profile = getattr(user, 'parent_profile', None)
            if not profile:
                return qs.none()
            scope = Q(pk__in=[])
            for class_name, section in profile.students.filter(
                school_id=user.school_id,
            ).values_list('class_name', 'section').distinct():
                scope |= Q(class_name=class_name, section=section)
            return qs.filter(scope)
        if user.role != User.Role.SCHOOL_ADMIN:
            return qs.none()
        return qs

    def perform_create(self, serializer):
        serializer.save(school=self.request.user.school)

    @action(detail=True, methods=['get'], url_path='results')
    def results(self, request, pk=None):
        exam = self.get_object()
        school_id = request.user.school_id
        if request.user.role == User.Role.PARENT:
            qs = ExamResult.objects.filter(
                exam=exam,
                school_id=school_id,
                student__parent_profiles__user=request.user,
                status=ExamResult.Status.SUBMITTED,
            )
        elif request.user.role == User.Role.STUDENT and hasattr(request.user, 'student_profile'):
            qs = ExamResult.objects.filter(
                exam=exam,
                school_id=school_id,
                student=request.user.student_profile.student,
                status=ExamResult.Status.SUBMITTED,
            )
        elif request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.TEACHER]:
            qs = ExamResult.objects.filter(exam=exam)
        else:
            return Response({'detail': 'You may only view your own child’s results.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(ExamResultSerializer(qs.select_related('student'), many=True).data)

    @action(detail=True, methods=['post'], url_path='results/submit')
    def submit_results(self, request, pk=None):
        exam = self.get_object()
        is_admin = request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]
        teacher = Teacher.objects.filter(user=request.user, status=Teacher.Status.ACTIVE).first()
        
        if not is_admin and not can_enter(teacher, exam):
            return Response({'detail': 'Only assigned teachers or school administrators can enter marks for this class, section, and subject.'}, status=status.HTTP_403_FORBIDDEN)
        
        entries = request.data.get('results', [])
        if not isinstance(entries, list):
            return Response({'errors': [{'row': None, 'field': 'results', 'error': 'must_be_a_list'}]}, status=status.HTTP_400_BAD_REQUEST)
        
        errors = []
        for index, row in enumerate(entries, start=1):
            student_id = row.get('studentId') if isinstance(row, dict) else None
            context = {'row': index, 'student_id': student_id}
            if not isinstance(row, dict) or not student_id:
                errors.append({**context, 'field': 'student_id', 'error': 'required'})
                continue
            try:
                marks = float(row.get('marksObtained')) if row.get('marksObtained') is not None and str(row.get('marksObtained')).strip() != '' else None
            except (TypeError, ValueError):
                errors.append({**context, 'field': 'marks_obtained', 'error': 'must_be_a_number'})
                continue
            if marks is not None and (not isfinite(marks) or marks < 0 or marks > exam.max_marks):
                errors.append({**context, 'field': 'marks_obtained', 'error': f'Marks must be between 0 and {exam.max_marks}'})
            if row.get('status', 'draft') not in ExamResult.Status.values:
                errors.append({**context, 'field': 'status', 'error': 'invalid_choice'})
            
            candidate_students = Student.objects.filter(
                id=student_id,
                school=exam.school,
                class_name=exam.class_name,
                section=exam.section,
            )
            if not is_admin and teacher:
                assigned_section_ids = teacher.sections.filter(
                    school=exam.school,
                    class_room__name=exam.class_name,
                    name=exam.section,
                ).values_list('id', flat=True)
                candidate_students = candidate_students.filter(section_record_id__in=assigned_section_ids)
            if not candidate_students.exists():
                errors.append({**context, 'field': 'student_id', 'error': 'Student not found in this class section'})
        
        if errors:
            return Response({'errors': errors}, status=status.HTTP_400_BAD_REQUEST)
        
        for row in entries:
            student_id = row['studentId']
            result, _ = ExamResult.objects.get_or_create(
                exam=exam,
                student_id=student_id,
                defaults={'school': exam.school, 'entered_by': request.user}
            )
            
            # If already submitted and user is a Teacher, they cannot modify unless Admin modifies/unlocks:
            if result.status == ExamResult.Status.SUBMITTED and not is_admin and row.get('status') == 'draft':
                return Response(
                    {'detail': 'Submitted results are locked for teachers. Please contact the administrator to make changes.'},
                    status=status.HTTP_409_CONFLICT,
                )

            marks_val = row.get('marksObtained')
            if marks_val is not None and str(marks_val).strip() != '':
                result.marks_obtained = float(marks_val)
            else:
                result.marks_obtained = None
            
            result.remarks = row.get('remarks', '') or ''
            result.status = row.get('status', 'draft')
            result.entered_by = request.user
            if result.status == ExamResult.Status.SUBMITTED:
                result.submitted_at = timezone.now()
            result.save()

            if result.status == ExamResult.Status.SUBMITTED:
                parent_profiles = result.student.parent_profiles.select_related('user')
                Notification.objects.bulk_create([
                    Notification(
                        school=exam.school,
                        sender=request.user,
                        recipient=p.user,
                        channel='exam-result',
                        category='Academic',
                        title=f'Exam Results Published: {exam.name}',
                        body=f'Official marks for {result.student.name} in {exam.subject} ({exam.class_name} {exam.section}) are now published.',
                        related_object={
                            'exam_id': exam.id,
                            'student_id': result.student_id,
                            'class_name': exam.class_name,
                            'section': exam.section,
                            'targetClass': exam.class_name,
                        },
                    )
                    for p in parent_profiles
                ])
        
        return Response({'updated': len(entries), 'detail': f'Marks successfully saved for {len(entries)} students.'})


class StudentResultsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: ExamResultSerializer(many=True), 403: OpenApiResponse(description='Forbidden'), 404: OpenApiResponse(description='Not found')})
    def get(self, request, student_id):
        student = Student.objects.filter(id=student_id, school=request.user.school).first()
        if not student:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == User.Role.PARENT and (not hasattr(request.user, 'parent_profile') or not request.user.parent_profile.students.filter(id=student_id).exists()):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == User.Role.STUDENT and (not hasattr(request.user, 'student_profile') or request.user.student_profile.student_id != student_id):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role not in [User.Role.PARENT, User.Role.STUDENT, User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN, User.Role.TEACHER]:
            return Response({'detail': 'Forbidden.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(ExamResultSerializer(ExamResult.objects.filter(student=student, status=ExamResult.Status.SUBMITTED).select_related('student', 'exam'), many=True).data)
