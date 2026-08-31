from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.schools.models import School
from apps.academics.models import Class, Section, Subject

from .models import Teacher, TeacherDocument, TeacherTeachingAssignment


@override_settings(SECURE_SSL_REDIRECT=False)
class TeacherDocumentAccessTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Teacher Document School', code='teacher-document-school')
        self.other_school = School.objects.create(name='Other Teacher Document School', code='other-teacher-document-school')
        self.admin = User.objects.create_user(
            username='teacher-document-admin', email='teacher-document-admin@example.com',
            password='StrongPass123!', role=User.Role.SCHOOL_ADMIN, school=self.school,
        )
        self.teacher_user = User.objects.create_user(
            username='teacher-document-owner', email='teacher-document-owner@example.com',
            password='StrongPass123!', role=User.Role.TEACHER, school=self.school,
        )
        self.teacher = Teacher.objects.create(
            school=self.school, user=self.teacher_user, joining_date='2026-08-05', phone='9000000000',
        )
        self.client = APIClient()

    def collection_url(self):
        return f'/api/v1/teachers/{self.teacher.id}/documents/'

    def document_url(self, document):
        return f'/api/v1/teachers/{self.teacher.id}/documents/{document.id}/'

    def test_school_admin_uploads_document_bytes_and_owner_can_download(self):
        self.client.force_authenticate(self.admin)
        payload = b'%PDF-1.4\nverified-teacher-document'
        response = self.client.post(self.collection_url(), {
            'name': 'Qualification Certificate',
            'file': SimpleUploadedFile('qualification.pdf', payload, content_type='application/pdf'),
        }, format='multipart')

        self.assertEqual(response.status_code, 201)
        document = TeacherDocument.objects.get(pk=response.data['id'])
        self.assertEqual(bytes(document.file_data), payload)
        self.assertEqual(document.file_content_type, 'application/pdf')
        self.assertEqual(document.file_name, 'qualification.pdf')
        self.assertEqual(response.data['downloadUrl'], self.document_url(document))

        self.client.force_authenticate(self.teacher_user)
        download = self.client.get(self.document_url(document))
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b''.join(download.streaming_content), payload)

    def test_teacher_cannot_upload_or_delete_documents(self):
        document = TeacherDocument.objects.create(
            teacher=self.teacher, name='ID Proof', file_data=b'%PDF-1.4\nid',
            file_content_type='application/pdf', file_name='id.pdf', file_type='PDF',
        )
        self.client.force_authenticate(self.teacher_user)
        upload = self.client.post(self.collection_url(), {
            'name': 'Blocked',
            'file': SimpleUploadedFile('blocked.pdf', b'%PDF-1.4\nblocked', content_type='application/pdf'),
        }, format='multipart')
        self.assertEqual(upload.status_code, 403)
        self.assertEqual(self.client.delete(self.document_url(document)).status_code, 403)

    def test_other_school_admin_cannot_access_teacher_documents(self):
        document = TeacherDocument.objects.create(
            teacher=self.teacher, name='ID Proof', file_data=b'%PDF-1.4\nid',
            file_content_type='application/pdf', file_name='id.pdf', file_type='PDF',
        )
        other_admin = User.objects.create_user(
            username='other-teacher-document-admin', email='other-teacher-document-admin@example.com',
            password='StrongPass123!', role=User.Role.SCHOOL_ADMIN, school=self.other_school,
        )
        self.client.force_authenticate(other_admin)
        self.assertEqual(self.client.get(self.document_url(document)).status_code, 404)
        self.assertEqual(self.client.delete(self.document_url(document)).status_code, 404)


@override_settings(SECURE_SSL_REDIRECT=False)
class TeacherSectionAssignmentTests(TestCase):
    def setUp(self):
        self.school = School.objects.create(name='Teacher Sections', code='teacher-sections')
        class_1 = Class.objects.create(school=self.school, name='Class 1', code='class-1')
        class_10 = Class.objects.create(school=self.school, name='Class 10', code='class-10')
        self.admin = User.objects.create_user(
            username='teacher-section-admin', email='teacher-section-admin@example.com',
            password='StrongPass123!', role=User.Role.SCHOOL_ADMIN, school=self.school,
        )
        self.section_1a = Section.objects.create(school=self.school, class_room=class_1, name='A')
        self.section_10d = Section.objects.create(school=self.school, class_room=class_10, name='D')
        self.mathematics = Subject.objects.create(school=self.school, name='Mathematics')
        self.science = Subject.objects.create(school=self.school, name='Science')
        class_1.subjects.add(self.mathematics, self.science)
        class_10.subjects.add(self.mathematics, self.science)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_create_and_patch_teacher_with_canonical_sections(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'Section Teacher', 'phone': '9000000990',
            'subjectIds': [self.mathematics.id, self.science.id],
            'assignedSectionIds': [self.section_1a.id, self.section_10d.id],
            'joiningDate': '2026-08-05', 'status': 'Active',
        }, format='json')
        self.assertEqual(create.status_code, 201)
        teacher = Teacher.objects.get(pk=create.data['id'])
        self.assertEqual(teacher.subjects, ['Mathematics', 'Science'])
        self.assertEqual(set(teacher.subject_records.values_list('id', flat=True)), {self.mathematics.id, self.science.id})
        self.assertEqual(set(teacher.sections.values_list('id', flat=True)), {self.section_1a.id, self.section_10d.id})
        self.assertEqual(set(create.data['assignedSections']), {'Class 1-A', 'Class 10-D'})

        update = self.client.patch(f'/api/v1/teachers/{teacher.id}/', {
            'assignedSectionIds': [self.section_10d.id],
        }, format='json')
        self.assertEqual(update.status_code, 200)
        self.assertEqual(list(teacher.sections.values_list('id', flat=True)), [self.section_10d.id])
        self.assertEqual(update.data['assignedSections'], ['Class 10-D'])

    def test_teacher_requires_subjects_created_by_the_same_school(self):
        missing = self.client.post('/api/v1/teachers/', {
            'name': 'No Subject Teacher', 'phone': '9000000991',
            'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(missing.status_code, 400)
        self.assertIn('subjectIds', missing.data)

        unassigned_subject = Subject.objects.create(school=self.school, name='Unassigned Subject')
        unassigned = self.client.post('/api/v1/teachers/', {
            'name': 'Unassigned Subject Teacher', 'phone': '9000000993',
            'subjectIds': [unassigned_subject.id], 'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(unassigned.status_code, 400)
        self.assertIn('subjectIds', unassigned.data)

        other_school = School.objects.create(name='Foreign Subjects', code='foreign-subjects')
        foreign_subject = Subject.objects.create(school=other_school, name='Foreign Subject')
        foreign = self.client.post('/api/v1/teachers/', {
            'name': 'Foreign Subject Teacher', 'phone': '9000000992',
            'subjectIds': [foreign_subject.id], 'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(foreign.status_code, 400)
        self.assertIn('subjectIds', foreign.data)

    def test_admin_adds_exact_timetable_assignment_without_replacing_existing_scope(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'Multi Class Teacher', 'phone': '9000000994',
            'subjectIds': [self.mathematics.id],
            'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(create.status_code, 201)

        assignment = self.client.post(
            f"/api/v1/teachers/{create.data['id']}/teaching-assignments/",
            {'sectionId': self.section_10d.id, 'subjectId': self.science.id},
            format='json',
        )

        self.assertEqual(assignment.status_code, 200)
        self.assertEqual(
            set(assignment.data['assignedSectionIds']),
            {self.section_1a.id, self.section_10d.id},
        )
        self.assertEqual(
            set(assignment.data['subjectIds']),
            {self.mathematics.id, self.science.id},
        )

        # Retrying the same request is intentionally idempotent.
        retry = self.client.post(
            f"/api/v1/teachers/{create.data['id']}/teaching-assignments/",
            {'sectionId': self.section_10d.id, 'subjectId': self.science.id},
            format='json',
        )
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(len(retry.data['assignedSectionIds']), 2)

    def test_timetable_assignment_rejects_foreign_and_unconfigured_records(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'Scoped Teacher', 'phone': '9000000995',
            'subjectIds': [self.mathematics.id],
            'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        teacher_url = f"/api/v1/teachers/{create.data['id']}/teaching-assignments/"

        unconfigured = Subject.objects.create(school=self.school, name='Unconfigured')
        invalid_subject = self.client.post(
            teacher_url,
            {'sectionId': self.section_10d.id, 'subjectId': unconfigured.id},
            format='json',
        )
        self.assertEqual(invalid_subject.status_code, 400)
        self.assertIn('subjectId', invalid_subject.data)

        other_school = School.objects.create(name='Other Assignment School', code='other-assignment')
        foreign_class = Class.objects.create(school=other_school, name='Foreign Class', code='foreign')
        foreign_section = Section.objects.create(
            school=other_school, class_room=foreign_class, name='A',
        )
        foreign = self.client.post(
            teacher_url,
            {'sectionId': foreign_section.id, 'subjectId': self.mathematics.id},
            format='json',
        )
        self.assertEqual(foreign.status_code, 400)
        self.assertIn('sectionId', foreign.data)

    def test_teacher_cannot_change_own_teaching_scope(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'Restricted Teacher', 'phone': '9000000996',
            'subjectIds': [self.mathematics.id],
            'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        teacher = Teacher.objects.select_related('user').get(pk=create.data['id'])
        self.client.force_authenticate(teacher.user)

        response = self.client.post(
            f'/api/v1/teachers/{teacher.id}/teaching-assignments/',
            {'sectionId': self.section_10d.id, 'subjectId': self.science.id},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_deleting_teacher_removes_the_linked_login_and_assignments(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'Delete Me', 'email': 'delete-me@example.com', 'phone': '9000000997',
            'subjectIds': [self.mathematics.id], 'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(create.status_code, 201)
        teacher_id = create.data['id']
        user_id = Teacher.objects.get(pk=teacher_id).user_id
        self.assertEqual(TeacherTeachingAssignment.objects.filter(teacher_id=teacher_id).count(), 1)

        response = self.client.delete(f'/api/v1/teachers/{teacher_id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Teacher.objects.filter(pk=teacher_id).exists())
        self.assertFalse(User.objects.filter(pk=user_id).exists())
        self.assertFalse(TeacherTeachingAssignment.objects.filter(teacher_id=teacher_id).exists())

    def test_teacher_creation_rejects_duplicate_email(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'First Teacher', 'email': 'unique-teacher@example.com', 'phone': '9888888881',
            'subjectIds': [self.mathematics.id], 'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(create.status_code, 201)

        duplicate = self.client.post('/api/v1/teachers/', {
            'name': 'Second Teacher', 'email': 'unique-teacher@example.com', 'phone': '9888888882',
            'subjectIds': [self.science.id], 'assignedSectionIds': [self.section_10d.id],
        }, format='json')
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('Email already exists.', str(duplicate.data))

    def test_teacher_creation_rejects_duplicate_phone(self):
        create = self.client.post('/api/v1/teachers/', {
            'name': 'First Phone Teacher', 'phone': '9888888883',
            'subjectIds': [self.mathematics.id], 'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(create.status_code, 201)

        duplicate = self.client.post('/api/v1/teachers/', {
            'name': 'Second Phone Teacher', 'phone': '9888888883',
            'subjectIds': [self.science.id], 'assignedSectionIds': [self.section_10d.id],
        }, format='json')
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('Phone number already exists.', str(duplicate.data))

    def test_teacher_update_rejects_duplicate_phone(self):
        teacher1 = self.client.post('/api/v1/teachers/', {
            'name': 'Teacher 1', 'phone': '9888888884',
            'subjectIds': [self.mathematics.id], 'assignedSectionIds': [self.section_1a.id],
        }, format='json')
        self.assertEqual(teacher1.status_code, 201)

        teacher2 = self.client.post('/api/v1/teachers/', {
            'name': 'Teacher 2', 'phone': '9888888885',
            'subjectIds': [self.science.id], 'assignedSectionIds': [self.section_10d.id],
        }, format='json')
        self.assertEqual(teacher2.status_code, 201)

        update = self.client.patch(f'/api/v1/teachers/{teacher2.data["id"]}/', {
            'phone': '9888888884',
        }, format='json')
        self.assertEqual(update.status_code, 400)
        self.assertIn('Phone number already exists.', str(update.data))

