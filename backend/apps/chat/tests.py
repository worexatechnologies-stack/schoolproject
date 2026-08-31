from datetime import date, time
from unittest.mock import patch

from django.test import TestCase
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import ParentProfile, User
from apps.attendance.models import AttendanceRecord
from apps.exams.models import Exam, ExamResult
from apps.schools.models import School
from apps.sis.models import Student
from .models import ChatbotInteraction


class ParentChatbotBoundaryTests(TestCase):
    def setUp(self):
        cache.clear()
        self.school = School.objects.create(name='Chat School', code='chat-school')
        self.other_school = School.objects.create(name='Other Chat School', code='other-chat-school')
        self.parent = User.objects.create_user(username='chat-parent', email='chat-parent@example.com', password='StrongPass123!', role=User.Role.PARENT, school=self.school)
        self.admin = User.objects.create_user(username='chat-admin', email='chat-admin@example.com', password='StrongPass123!', role=User.Role.SCHOOL_ADMIN, school=self.school)
        self.super_admin = User.objects.create_superuser(username='chat-super', email='chat-super@example.com', password='StrongPass123!', role=User.Role.SUPER_ADMIN)
        self.student = self.make_student(self.school, 'CHAT-1', 'Linked Child')
        self.other_student = self.make_student(self.other_school, 'CHAT-2', 'Other Child')
        ParentProfile.objects.create(user=self.parent, phone='9600000000').students.add(self.student)
        self.result(self.student, 88); self.result(self.other_student, 12)
        AttendanceRecord.objects.create(school=self.school, student=self.student, date=date.today(), status='Present')
        self.client = APIClient(); self.client.force_authenticate(self.parent)

    def make_student(self, school, admission, name):
        return Student.objects.create(school=school, admission_no=admission, name=name, class_name='8', section='A', roll_no=1, parent_name='Parent', parent_phone=f'9{admission[-1]}60000000', parent_email=f'{admission}@example.com', dob=date(2012, 1, 1), gender='Female', academic_year='2026-27')

    def result(self, student, marks):
        exam = Exam.objects.create(school=student.school, name=f'{student.name} Exam', class_name='8', section='A', subject='Math', date=date.today(), time=time(9), max_marks=100)
        ExamResult.objects.create(school=student.school, exam=exam, student=student, marks_obtained=marks, status=ExamResult.Status.SUBMITTED)

    def test_parent_cannot_query_unlinked_student(self):
        self.assertEqual(self.client.post('/api/v1/chatbot/ask/', {'student_id': self.other_student.id, 'message': 'How is the child doing?'}, format='json').status_code, 403)

    @patch('apps.chat.views.answer_question', return_value=('Verified response', 17))
    def test_provider_receives_only_linked_student_snapshot(self, mocked_answer):
        response = self.client.post('/api/v1/chatbot/ask/', {'student_id': self.student.id, 'message': 'What is the Math mark?'}, format='json')
        self.assertEqual(response.status_code, 200)
        snapshot = mocked_answer.call_args.kwargs['snapshot']
        self.assertEqual(snapshot['student']['id'], self.student.id)
        self.assertNotIn(self.other_student.name, str(snapshot)); self.assertNotIn('12', str(snapshot))
        self.assertEqual(ChatbotInteraction.objects.get().token_usage, 17)

    @patch('rest_framework.throttling.ScopedRateThrottle.THROTTLE_RATES', {'parent_chatbot': '1/hour'})
    @patch('apps.chat.views.answer_question', return_value=('ok', 0))
    def test_rate_limit_applies_per_parent(self, _):
        self.assertEqual(self.client.post('/api/v1/chatbot/ask/', {'student_id': self.student.id, 'message': 'one'}, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/chatbot/ask/', {'student_id': self.student.id, 'message': 'two'}, format='json').status_code, 429)

    def test_interaction_audit_is_school_admin_scoped_and_super_admin_denied(self):
        ChatbotInteraction.objects.create(school=self.school, parent=self.parent, student=self.student, question='q', response='r')
        self.client.force_authenticate(self.admin); self.assertEqual(self.client.get('/api/v1/chatbot/interactions/').status_code, 200)
        self.client.force_authenticate(self.super_admin); self.assertEqual(self.client.get('/api/v1/chatbot/interactions/').status_code, 403)


class RoleBasedChatWorkflowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.school = School.objects.create(name='Academics School', code='acad-school')
        
        # Admin
        self.admin = User.objects.create_user(
            username='school-admin-chat', email='admin@acad.edu',
            password='StrongPass123!', role=User.Role.SCHOOL_ADMIN, school=self.school
        )

        # Teachers
        self.teacher_user1 = User.objects.create_user(
            username='teacher-math', email='math@acad.edu',
            first_name='Sarah', last_name='Math',
            password='StrongPass123!', role=User.Role.TEACHER, school=self.school
        )
        from apps.staff.models import Teacher
        self.teacher1 = Teacher.objects.create(
            school=self.school, user=self.teacher_user1,
            assigned_sections=['Class 10 - Sec A', 'Class 5 - Sec B'],
            subjects=['Mathematics', 'Physics'],
            phone='9876543210', joining_date=date(2022, 1, 1),
        )

        self.teacher_user2 = User.objects.create_user(
            username='teacher-eng', email='eng@acad.edu',
            first_name='John', last_name='English',
            password='StrongPass123!', role=User.Role.TEACHER, school=self.school
        )
        self.teacher2 = Teacher.objects.create(
            school=self.school, user=self.teacher_user2,
            assigned_sections=['Class 8 - Sec A'],
            subjects=['English'],
            phone='9876543211', joining_date=date(2022, 1, 1),
        )

        # Parent with 2 sons in different classes:
        # Son 1 in Class 10-A (taught by Teacher 1)
        # Son 2 in Class 8-A (taught by Teacher 2)
        self.parent_user = User.objects.create_user(
            username='parent-multi', email='multi.parent@example.com',
            first_name='Robert', last_name='Doe',
            password='StrongPass123!', role=User.Role.PARENT, school=self.school
        )
        self.son1 = Student.objects.create(
            school=self.school, admission_no='SON-101', name='John Doe',
            class_name='Class 10', section='A', roll_no=12,
            parent_name='Robert Doe', parent_phone='9999999991', parent_email='multi.parent@example.com',
            dob=date(2010, 5, 12), gender='Male', academic_year='2026-27'
        )
        self.son2 = Student.objects.create(
            school=self.school, admission_no='SON-102', name='Alex Doe',
            class_name='Class 8', section='A', roll_no=5,
            parent_name='Robert Doe', parent_phone='9999999991', parent_email='multi.parent@example.com',
            dob=date(2012, 8, 20), gender='Male', academic_year='2026-27'
        )
        self.parent_profile = ParentProfile.objects.create(user=self.parent_user, phone='9999999991')
        self.parent_profile.students.add(self.son1, self.son2)

        # Unrelated student & parent in Class 9-B
        self.unrelated_parent_user = User.objects.create_user(
            username='parent-unrelated', email='unrelated.parent@example.com',
            password='StrongPass123!', role=User.Role.PARENT, school=self.school
        )
        self.unrelated_student = Student.objects.create(
            school=self.school, admission_no='OTH-999', name='Other Student',
            class_name='Class 9', section='B', roll_no=1,
            parent_name='Other Parent', parent_phone='9999999999', parent_email='unrelated.parent@example.com',
            dob=date(2011, 1, 1), gender='Female', academic_year='2026-27'
        )
        ParentProfile.objects.create(user=self.unrelated_parent_user, phone='9999999999').students.add(self.unrelated_student)

        self.client = APIClient()

    def test_admin_chat_contacts_returns_teachers_only_with_classes_and_sections(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get('/api/v1/chat/contacts/')
        self.assertEqual(res.status_code, 200)
        contacts = res.json()
        roles = {c['role'] for c in contacts}
        self.assertEqual(roles, {'Teacher'})
        teacher1_data = next(c for c in contacts if c['userId'] == self.teacher_user1.id)
        self.assertIn('Class 10 - Sec A', teacher1_data['assignedSections'])
        self.assertIn('Mathematics', teacher1_data['subjects'])

    def test_admin_cannot_start_chat_with_parents_or_students(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/v1/chat/conversations/start/', {'targetUserId': self.parent_user.id}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertIn('School Admins can only direct chat with teachers', res.json()['detail'])

    def test_admin_can_start_chat_with_teachers(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/v1/chat/conversations/start/', {'targetUserId': self.teacher_user1.id}, format='json')
        self.assertEqual(res.status_code, 200)

    def test_teacher_chat_contacts_returns_admin_and_parents_of_assigned_students(self):
        self.client.force_authenticate(self.teacher_user1)
        res = self.client.get('/api/v1/chat/contacts/')
        self.assertEqual(res.status_code, 200)
        contacts = res.json()
        
        # Must have Admin office desk
        admin_c = next(c for c in contacts if c['role'] == 'School Admin')
        self.assertEqual(admin_c['userId'], self.admin.id)
        
        # Must have Parent of Son 1 (John Doe)
        parent_c = next(c for c in contacts if c['userId'] == self.parent_user.id)
        self.assertEqual(parent_c['role'], 'Parent')
        self.assertIn('John Doe', parent_c['studentNames'])
        self.assertIn('Parent of John Doe', parent_c['studentSummary'])
        
        # Must NOT contain unrelated parent
        self.assertNotIn(self.unrelated_parent_user.id, [c['userId'] for c in contacts])

    def test_teacher_can_start_chat_with_admin_and_own_student_parent(self):
        self.client.force_authenticate(self.teacher_user1)
        
        # Chat with admin: OK
        res_admin = self.client.post('/api/v1/chat/conversations/start/', {'targetUserId': self.admin.id}, format='json')
        self.assertEqual(res_admin.status_code, 200)
        
        # Chat with assigned student parent: OK
        res_parent = self.client.post('/api/v1/chat/conversations/start/', {'targetUserId': self.parent_user.id}, format='json')
        self.assertEqual(res_parent.status_code, 200)
        
        # Chat with unassigned parent: 403 Forbidden
        res_unassigned = self.client.post('/api/v1/chat/conversations/start/', {'targetUserId': self.unrelated_parent_user.id}, format='json')
        self.assertEqual(res_unassigned.status_code, 403)

    def test_parent_with_multiple_children_sees_teachers_of_all_children(self):
        self.client.force_authenticate(self.parent_user)
        res = self.client.get('/api/v1/chat/contacts/')
        self.assertEqual(res.status_code, 200)
        contacts = res.json()
        
        # Parent of Son 1 and Son 2 should see Teacher 1 (for Son 1) and Teacher 2 (for Son 2)
        teacher_ids = {c['userId'] for c in contacts}
        self.assertIn(self.teacher_user1.id, teacher_ids)
        self.assertIn(self.teacher_user2.id, teacher_ids)
        
        # Check child mappings on Teacher 1
        t1 = next(c for c in contacts if c['userId'] == self.teacher_user1.id)
        self.assertEqual(t1['childMappings'][0]['studentName'], 'John Doe')
        self.assertEqual(t1['childMappings'][0]['className'], 'Class 10')
        self.assertEqual(t1['childMappings'][0]['sectionName'], 'A')
        self.assertIn('Mathematics', t1['childMappings'][0]['subjects'])
        
        # Check child mappings on Teacher 2
        t2 = next(c for c in contacts if c['userId'] == self.teacher_user2.id)
        self.assertEqual(t2['childMappings'][0]['studentName'], 'Alex Doe')
        self.assertEqual(t2['childMappings'][0]['className'], 'Class 8')
        self.assertEqual(t2['childMappings'][0]['sectionName'], 'A')
        self.assertIn('English', t2['childMappings'][0]['subjects'])
