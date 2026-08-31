from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer

from apps.accounts.models import User
from apps.sis.models import Student
from .models import ChatbotInteraction
from .services import answer_question, student_snapshot


class ParentChatbotAskView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'parent_chatbot'

    @extend_schema(
        request=inline_serializer('ParentChatbotAskRequest', {'student_id': serializers.IntegerField(), 'message': serializers.CharField()}),
        responses={200: inline_serializer('ParentChatbotAskResponse', {'response': serializers.CharField(), 'interaction_id': serializers.IntegerField(), 'token_usage': serializers.IntegerField()}), 403: OpenApiResponse(description='Forbidden')},
    )
    def post(self, request):
        if request.user.role != User.Role.PARENT:
            return Response({'detail': 'Only linked parents may use the academic assistant.'}, status=status.HTTP_403_FORBIDDEN)
        student_id, message = request.data.get('student_id'), str(request.data.get('message', '')).strip()
        if not student_id or not message:
            return Response({'errors': [{'field': 'student_id' if not student_id else 'message', 'error': 'required'}]}, status=status.HTTP_400_BAD_REQUEST)
        profile = getattr(request.user, 'parent_profile', None)
        student = Student.objects.filter(pk=student_id, school=request.user.school).first()
        if not profile or not student or not profile.students.filter(pk=student.pk).exists():
            return Response({'detail': 'You may ask only about a linked student.'}, status=status.HTTP_403_FORBIDDEN)
        snapshot = student_snapshot(student)
        response_text, token_usage = answer_question(snapshot=snapshot, message=message)
        interaction = ChatbotInteraction.objects.create(school=student.school, parent=request.user, student=student, question=message, response=response_text, token_usage=token_usage)
        return Response({'response': response_text, 'interaction_id': interaction.id, 'token_usage': token_usage})


class ChatbotInteractionListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: inline_serializer('ChatbotInteractionResponse', {'id': serializers.IntegerField(), 'parent_id': serializers.IntegerField(), 'student_id': serializers.IntegerField(), 'question': serializers.CharField(), 'response': serializers.CharField(), 'token_usage': serializers.IntegerField(), 'created_at': serializers.DateTimeField()}, many=True), 403: OpenApiResponse(description='Forbidden')})
    def get(self, request):
        if request.user.role == User.Role.SUPER_ADMIN:
            return Response({'detail': 'Super Admin access to parent chatbot interactions is denied.'}, status=status.HTTP_403_FORBIDDEN)
        if request.user.role != User.Role.SCHOOL_ADMIN:
            return Response({'detail': 'School Admin access is required.'}, status=status.HTTP_403_FORBIDDEN)
        records = ChatbotInteraction.objects.filter(school=request.user.school).select_related('parent', 'student')
        return Response([{'id': row.id, 'parent_id': row.parent_id, 'student_id': row.student_id, 'question': row.question, 'response': row.response, 'token_usage': row.token_usage, 'created_at': row.created_at} for row in records])


from django.db.models import Q
from django.utils import timezone
from apps.accounts.models import ParentProfile, User
from apps.staff.models import Teacher
from apps.sis.access import teacher_student_queryset
from .models import Conversation, DirectMessage
from .serializers import ConversationSerializer, DirectMessageSerializer


def check_teacher_matches_student(teacher, student):
    s_class = (student.class_name or '').replace('Class', '').strip().lower()
    s_sec = (student.section or '').replace('Section', '').replace('Sec', '').strip().lower()
    s_sec_id = student.section_record_id

    # 1. Section records
    if s_sec_id:
        if teacher.sections.filter(id=s_sec_id).exists() or teacher.teaching_assignments.filter(section_id=s_sec_id).exists():
            return True

    # 2. Teaching assignments by name
    for ta in teacher.teaching_assignments.select_related('section__class_room').all():
        if not ta.section:
            continue
        ta_class = (ta.section.class_room.name or '').replace('Class', '').strip().lower() if hasattr(ta.section, 'class_room') and ta.section.class_room else ''
        ta_sec = (ta.section.name or '').replace('Section', '').replace('Sec', '').strip().lower()
        if (s_sec_id and ta.section_id == s_sec_id) or (ta_sec == s_sec and (not ta_class or ta_class == s_class)):
            return True

    # 3. Canonical sections by name
    for sec in teacher.sections.select_related('class_room').all():
        sec_class = (sec.class_room.name or '').replace('Class', '').strip().lower() if hasattr(sec, 'class_room') and sec.class_room else ''
        sec_name = (sec.name or '').replace('Section', '').replace('Sec', '').strip().lower()
        if (s_sec_id and sec.id == s_sec_id) or (sec_name == s_sec and (not sec_class or sec_class == s_class)):
            return True

    # 4. Text assigned_sections (e.g. "Class 10 - Sec A")
    if teacher.assigned_sections:
        for asec in teacher.assigned_sections:
            asec_clean = asec.replace('Class', '').replace('Section', '').replace('Sec', '').strip().lower()
            if ' - ' in asec:
                parts = asec.split(' - ')
                c_part = parts[0].replace('Class', '').strip().lower()
                s_part = parts[1].replace('Sec', '').replace('Section', '').strip().lower()
                if c_part == s_class and s_part == s_sec:
                    return True
            elif f'{s_class}-{s_sec}' in asec_clean.replace(' ', '') or (s_class in asec_clean and s_sec in asec_clean):
                return True
    return False


def get_teacher_permitted_students(teacher, school_id):
    if not teacher or teacher.status != Teacher.Status.ACTIVE:
        return Student.objects.none()

    section_ids = list(teacher.sections.values_list('id', flat=True))
    assignment_section_ids = list(teacher.teaching_assignments.values_list('section_id', flat=True))
    all_section_ids = set(section_ids + assignment_section_ids)

    text_sections = teacher.assigned_sections or []

    qs = Student.objects.filter(school_id=school_id, status='Active')
    filters = Q()
    if all_section_ids:
        filters |= Q(section_record_id__in=all_section_ids)

    if text_sections:
        for tsec in text_sections:
            if ' - ' in tsec:
                parts = tsec.split(' - ')
                c_part = parts[0].replace('Class', '').strip()
                s_part = parts[1].replace('Sec', '').replace('Section', '').strip()
                filters |= Q(class_name__icontains=c_part, section__iexact=s_part)
            else:
                tsec_clean = tsec.replace('Class', '').replace('Section', '').replace('Sec', '').strip()
                parts = tsec_clean.split()
                if len(parts) >= 2:
                    filters |= Q(class_name__icontains=parts[0], section__icontains=parts[1])
                elif len(parts) == 1:
                    filters |= Q(section__iexact=parts[0])

    if not filters:
        return Student.objects.none()
    return qs.filter(filters).distinct()


class ChatContactsListView(APIView):
    """
    Returns role-scoped chat contacts with rich differentiation:
    - School Admin: Teachers with assigned classes, sections, and subjects.
    - Teacher: School Admin (Office Desk) + Parents of assigned students (differentiated by student).
    - Parent: Teachers of all linked students (handles multi-children case, mentioning class, section, subjects).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        school = user.school
        if not school or user.role == User.Role.STUDENT:
            return Response([])

        # 1. ADMIN: All Teachers in the school differentiated by class and section
        if user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            teachers = Teacher.objects.filter(school=school, status='Active').select_related('user').prefetch_related(
                'sections__class_room', 'subject_records', 'teaching_assignments__section__class_room', 'teaching_assignments__subject'
            )
            contacts = []
            for t in teachers:
                assigned_sections = list(t.assigned_sections or [])
                for s in t.sections.all():
                    label = f"{s.class_room.name} - Sec {s.name}" if hasattr(s, 'class_room') and s.class_room else f"Sec {s.name}"
                    if label not in assigned_sections:
                        assigned_sections.append(label)
                for ta in t.teaching_assignments.all():
                    label = f"{ta.section.class_room.name} - Sec {ta.section.name}" if hasattr(ta.section, 'class_room') and ta.section.class_room else f"Sec {ta.section.name}"
                    if label not in assigned_sections:
                        assigned_sections.append(label)

                subjects = list(t.subjects or [])
                for sub in t.subject_records.all():
                    if sub.name not in subjects:
                        subjects.append(sub.name)
                for ta in t.teaching_assignments.all():
                    if ta.subject and ta.subject.name not in subjects:
                        subjects.append(ta.subject.name)

                assignments_data = [
                    {
                        'classId': ta.section.class_room_id if hasattr(ta.section, 'class_room') and ta.section.class_room else None,
                        'className': ta.section.class_room.name if hasattr(ta.section, 'class_room') and ta.section.class_room else '',
                        'sectionId': ta.section_id,
                        'sectionName': ta.section.name if ta.section else '',
                        'subjectId': ta.subject_id,
                        'subjectName': ta.subject.name if ta.subject else '',
                    }
                    for ta in t.teaching_assignments.all()
                ]

                contacts.append({
                    'id': t.id,
                    'userId': t.user_id,
                    'name': t.user.get_full_name() or t.user.username or f"Teacher #{t.id}",
                    'role': 'Teacher',
                    'email': t.user.email,
                    'phone': t.phone or '',
                    'isOnline': t.user.is_online_computed,
                    'assignedSections': assigned_sections,
                    'subjects': subjects,
                    'teachingAssignments': assignments_data,
                })
            return Response(contacts)

        # 2. TEACHER: School Admin + Parents of assigned students (differentiated by student)
        elif user.role == User.Role.TEACHER:
            teacher_profile = getattr(user, 'teacher_profile', None)
            if not teacher_profile:
                return Response([])

            contacts = []
            # Add School Admin
            admin_user = User.objects.filter(
                school=school,
                role=User.Role.SCHOOL_ADMIN,
                is_active=True,
            ).first()
            if admin_user:
                contacts.append({
                    'id': 'admin-office',
                    'userId': admin_user.id,
                    'name': 'School Admin / Office Desk',
                    'role': 'School Admin',
                    'email': admin_user.email,
                    'phone': '',
                    'isOnline': admin_user.is_online_computed,
                    'isOfficeDesk': True,
                })

            # Add Parents of assigned students
            permitted_students = get_teacher_permitted_students(
                teacher_profile,
                school.id,
            ).prefetch_related('parent_profiles__user')

            parent_map = {}
            for student in permitted_students:
                for pp in student.parent_profiles.all():
                    p_user = pp.user
                    if not p_user or not p_user.is_active:
                        continue
                    p_key = p_user.id
                    if p_key not in parent_map:
                        parent_map[p_key] = {
                            'id': f'parent-{p_user.id}',
                            'userId': p_user.id,
                            'name': p_user.get_full_name() or student.parent_name or p_user.username,
                            'role': 'Parent',
                            'email': p_user.email,
                            'phone': pp.phone or student.parent_phone or '',
                            'isOnline': p_user.is_online_computed,
                            'students': [],
                            'assignedSections': [],
                            'subjects': teacher_profile.subjects or [],
                        }
                    s_info = {
                        'id': student.id,
                        'name': student.name,
                        'className': student.class_name,
                        'section': student.section,
                        'rollNo': student.roll_no,
                        'admissionNo': student.admission_no,
                    }
                    if not any(s['id'] == student.id for s in parent_map[p_key]['students']):
                        parent_map[p_key]['students'].append(s_info)
                        sec_label = f"{student.class_name} - Sec {student.section}"
                        if sec_label not in parent_map[p_key]['assignedSections']:
                            parent_map[p_key]['assignedSections'].append(sec_label)

            for p_data in parent_map.values():
                stu_summaries = [f"{s['name']} ({s['className']} - Sec {s['section']}, Roll #{s['rollNo']})" for s in p_data['students']]
                p_data['studentSummary'] = f"Parent of {', '.join(stu_summaries)}"
                p_data['studentNames'] = [s['name'] for s in p_data['students']]
                contacts.append(p_data)

            return Response(contacts)

        # 3. PARENT: Teachers of all linked students (handling multi-children case, mentioning class, section, subjects)
        elif user.role == User.Role.PARENT:
            parent_profile = getattr(user, 'parent_profile', None)
            if not parent_profile:
                return Response([])

            linked_students = list(parent_profile.students.filter(school=school, status='Active').select_related('section_record', 'section_record__class_room'))
            if not linked_students:
                return Response([])

            contacts = []
            teachers = Teacher.objects.filter(school=school, status='Active').select_related('user').prefetch_related(
                'sections__class_room', 'subject_records', 'teaching_assignments__section__class_room', 'teaching_assignments__subject'
            )

            for t in teachers:
                child_mappings = []
                assigned_sections = list(t.assigned_sections or [])
                for s in t.sections.all():
                    label = f"{s.class_room.name} - Sec {s.name}" if hasattr(s, 'class_room') and s.class_room else f"Sec {s.name}"
                    if label not in assigned_sections:
                        assigned_sections.append(label)
                for ta in t.teaching_assignments.all():
                    label = f"{ta.section.class_room.name} - Sec {ta.section.name}" if hasattr(ta.section, 'class_room') and ta.section.class_room else f"Sec {ta.section.name}"
                    if label not in assigned_sections:
                        assigned_sections.append(label)

                teacher_subjects = list(t.subjects or [])
                for sub in t.subject_records.all():
                    if sub.name not in teacher_subjects:
                        teacher_subjects.append(sub.name)

                for st in linked_students:
                    if check_teacher_matches_student(t, st):
                        # Determine subjects for this student
                        matched_subs = set()
                        for ta in t.teaching_assignments.all():
                            ta_class = (ta.section.class_room.name or '').replace('Class', '').strip().lower() if hasattr(ta.section, 'class_room') and ta.section.class_room else ''
                            ta_sec = (ta.section.name or '').replace('Section', '').replace('Sec', '').strip().lower() if ta.section else ''
                            st_class = (st.class_name or '').replace('Class', '').strip().lower()
                            st_sec = (st.section or '').replace('Section', '').replace('Sec', '').strip().lower()
                            if (st.section_record_id and ta.section_id == st.section_record_id) or (ta_sec == st_sec and (not ta_class or ta_class == st_class)):
                                if ta.subject:
                                    matched_subs.add(ta.subject.name)

                        final_subs = list(matched_subs) if matched_subs else teacher_subjects
                        child_mappings.append({
                            'studentId': st.id,
                            'studentName': st.name,
                            'className': st.class_name,
                            'sectionName': st.section,
                            'subjects': final_subs,
                        })

                if child_mappings:
                    contacts.append({
                        'id': t.id,
                        'userId': t.user_id,
                        'name': t.user.get_full_name() or t.user.username or f"Teacher #{t.id}",
                        'role': 'Teacher',
                        'email': t.user.email,
                        'phone': t.phone or '',
                        'isOnline': t.user.is_online_computed,
                        'assignedSections': assigned_sections,
                        'subjects': teacher_subjects,
                        'childMappings': child_mappings,
                    })

            return Response(contacts)

        return Response([])


class ConversationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=ConversationSerializer(many=True))
    def get(self, request):
        if request.user.role == User.Role.STUDENT:
            return Response([])

        conversations = Conversation.objects.filter(
            Q(participant1=request.user) | Q(participant2=request.user),
            school=request.user.school,
        ).select_related('participant1', 'participant2', 'school').prefetch_related('messages')

        if request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            # Admin can only chat with teachers
            conversations = [
                c for c in conversations
                if c.get_other_participant(request.user).role == User.Role.TEACHER
            ]
        elif request.user.role == User.Role.TEACHER:
            # Teacher can chat with School Admin and parents of students taught by this teacher
            teacher_profile = getattr(request.user, 'teacher_profile', None)
            if not teacher_profile:
                return Response([])

            permitted_students = get_teacher_permitted_students(
                teacher_profile,
                school_id=request.user.school_id,
            )
            parent_user_ids = set(
                ParentProfile.objects.filter(
                    students__in=permitted_students,
                    user__school=request.user.school
                ).values_list('user_id', flat=True)
            )
            admin_user_ids = set(
                User.objects.filter(
                    school=request.user.school,
                    role__in=[User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]
                ).values_list('id', flat=True)
            )
            allowed_partner_ids = parent_user_ids | admin_user_ids

            conversations = [
                c for c in conversations
                if c.get_other_participant(request.user).id in allowed_partner_ids
            ]
        elif request.user.role == User.Role.PARENT:
            # Parent can only chat with teachers of their linked students
            parent_profile = getattr(request.user, 'parent_profile', None)
            if not parent_profile:
                return Response([])
            linked_students = list(parent_profile.students.filter(school=request.user.school, status='Active'))

            teachers = Teacher.objects.filter(school=request.user.school, status='Active').select_related('user')
            allowed_teacher_user_ids = set()
            for t in teachers:
                if any(check_teacher_matches_student(t, st) for st in linked_students):
                    allowed_teacher_user_ids.add(t.user_id)

            conversations = [
                c for c in conversations
                if c.get_other_participant(request.user).id in allowed_teacher_user_ids
            ]

        serializer = ConversationSerializer(conversations, many=True, context={'request': request})
        return Response(serializer.data)


class StartConversationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        request=inline_serializer('StartConversationRequest', {
            'targetUserId': serializers.IntegerField(required=False),
            'teacherId': serializers.IntegerField(required=False),
            'studentId': serializers.IntegerField(required=False),
        }),
        responses=ConversationSerializer,
    )
    def post(self, request):
        if request.user.role == User.Role.STUDENT:
            return Response({'detail': 'Direct chat is not available for student accounts.'}, status=status.HTTP_403_FORBIDDEN)

        target_user_id = request.data.get('targetUserId')
        teacher_id = request.data.get('teacherId')
        student_id = request.data.get('studentId')

        target_user = None
        if target_user_id:
            target_user = User.objects.filter(pk=target_user_id, school=request.user.school).first()
        elif teacher_id:
            teacher = Teacher.objects.filter(pk=teacher_id, school=request.user.school).select_related('user').first()
            if teacher:
                target_user = teacher.user
        elif student_id:
            student = Student.objects.filter(pk=student_id, school=request.user.school).first()
            if student:
                # If teacher, verify assignment
                if request.user.role == User.Role.TEACHER:
                    teacher_profile = getattr(request.user, 'teacher_profile', None)
                    if not teacher_profile or not check_teacher_matches_student(teacher_profile, student):
                        return Response({'detail': 'You are not assigned to teach this student.'}, status=status.HTTP_403_FORBIDDEN)
                parent_profile = student.parent_profiles.select_related('user').first()
                if parent_profile and parent_profile.user:
                    target_user = parent_profile.user

        if not target_user:
            return Response({'detail': 'Target user not found.'}, status=status.HTTP_404_NOT_FOUND)

        if target_user.id == request.user.id:
            return Response({'detail': 'Cannot start a conversation with yourself.'}, status=status.HTTP_400_BAD_REQUEST)

        # Admin can only chat with teachers
        if request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            if target_user.role != User.Role.TEACHER:
                return Response({'detail': 'School Admins can only direct chat with teachers.'}, status=status.HTTP_403_FORBIDDEN)

        # Teacher can chat with School Admin and parents of their assigned students
        elif request.user.role == User.Role.TEACHER:
            teacher_profile = getattr(request.user, 'teacher_profile', None)
            if not teacher_profile:
                return Response({'detail': 'Teacher profile not found.'}, status=status.HTTP_403_FORBIDDEN)

            if target_user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
                pass  # Allowed
            elif target_user.role == User.Role.PARENT:
                permitted_students = get_teacher_permitted_students(
                    teacher_profile,
                    school_id=request.user.school_id,
                )
                parent_profile = getattr(target_user, 'parent_profile', None)
                if not parent_profile or not parent_profile.students.filter(id__in=permitted_students.values_list('id', flat=True)).exists():
                    return Response({'detail': 'You can only chat with parents of students assigned to your classes.'}, status=status.HTTP_403_FORBIDDEN)
            else:
                return Response({'detail': 'Teachers can only chat with School Admins and parents of their assigned students.'}, status=status.HTTP_403_FORBIDDEN)

        # Parent can only chat with the teachers of their linked students
        elif request.user.role == User.Role.PARENT:
            if target_user.role != User.Role.TEACHER:
                return Response({'detail': "Parents can only direct chat with their children's teachers."}, status=status.HTTP_403_FORBIDDEN)

            parent_profile = getattr(request.user, 'parent_profile', None)
            if not parent_profile:
                return Response({'detail': 'Parent profile not found.'}, status=status.HTTP_403_FORBIDDEN)

            linked_students = list(parent_profile.students.filter(school=request.user.school, status='Active'))
            teacher_obj = getattr(target_user, 'teacher_profile', None)
            if not teacher_obj or not any(check_teacher_matches_student(teacher_obj, st) for st in linked_students):
                return Response({'detail': 'You can only direct chat with teachers assigned to your children.'}, status=status.HTTP_403_FORBIDDEN)

        conv, _ = Conversation.get_or_create_between(request.user.school, request.user, target_user)
        return Response(ConversationSerializer(conv, context={'request': request}).data)


class ConversationMessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_conversation(self, request, conversation_id):
        conv = Conversation.objects.filter(pk=conversation_id, school=request.user.school).first()
        if not conv:
            return None, Response({'detail': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.id not in (conv.participant1_id, conv.participant2_id):
            return None, Response({'detail': 'You are not a participant in this conversation.'}, status=status.HTTP_403_FORBIDDEN)
        return conv, None

    @extend_schema(responses=DirectMessageSerializer(many=True))
    def get(self, request, conversation_id):
        conv, err_resp = self.get_conversation(request, conversation_id)
        if err_resp:
            return err_resp

        # Mark unread messages as read
        DirectMessage.objects.filter(
            conversation=conv,
            recipient=request.user,
            read_at__isnull=True,
        ).update(read_at=timezone.now())

        messages = conv.messages.select_related('sender', 'recipient').order_by('created_at')
        return Response(DirectMessageSerializer(messages, many=True, context={'request': request}).data)

    @extend_schema(
        request=inline_serializer('SendDirectMessageRequest', {'message': serializers.CharField()}),
        responses=DirectMessageSerializer,
    )
    def post(self, request, conversation_id):
        conv, err_resp = self.get_conversation(request, conversation_id)
        if err_resp:
            return err_resp

        body = str(request.data.get('message', '')).strip()
        if not body:
            return Response({'detail': 'message body is required.'}, status=status.HTTP_400_BAD_REQUEST)

        recipient = conv.get_other_participant(request.user)

        dm = DirectMessage.objects.create(
            conversation=conv,
            sender=request.user,
            recipient=recipient,
            body=body,
        )

        conv.updated_at = timezone.now()
        conv.save(update_fields=['updated_at'])

        return Response(DirectMessageSerializer(dm, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ChatClearAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={204: None})
    def delete(self, request):
        if request.user.role != User.Role.SCHOOL_ADMIN:
            return Response({'detail': 'Only school admins can clear all chat data.'}, status=status.HTTP_403_FORBIDDEN)

        DirectMessage.objects.filter(conversation__school_id=request.user.school_id).delete()
        Conversation.objects.filter(school_id=request.user.school_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
