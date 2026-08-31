from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.credential_generator import create_user_with_credentials
from apps.common.validators import optimize_raster_image

from .models import Teacher, TeacherTeachingAssignment


def create_teacher_with_login(*, school, data, created_by=None):
    with transaction.atomic():
        try:
            section_records = data.get('sections', [])
            subject_records = data['subject_records']
            teaching_assignments = data['teachingAssignments']
            email = data.get('email')
            password = data.get('password')
            user, credentials = create_user_with_credentials(person=data['name'], role=User.Role.TEACHER, school=school, email=email)
            if password:
                user.set_password(password)
                user.must_change_password = False
                user.save(update_fields=['password', 'must_change_password'])
                credentials['plaintext_password'] = password
                credentials['mustChangePassword'] = False
            photo = data.get('photo')
            if photo:
                photo_data, photo_content_type, _ = optimize_raster_image(photo)
            else:
                photo_content_type = ''
                photo_data = None
            teacher = Teacher.objects.create(
                school=school,
                user=user,
                subjects=[subject.name for subject in subject_records],
                assigned_sections=data.get('assigned_sections') or [
                    f'{section.class_room.name}-{section.name}' for section in section_records
                ],
                qualification=data.get('qualification', ''),
                joining_date=data.get('joining_date') or timezone.now().date(),
                phone=data.get('phone') or '',
                photo_data=photo_data,
                photo_content_type=photo_content_type,
                status=data.get('status', Teacher.Status.ACTIVE),
            )
            if section_records:
                teacher.sections.set(section_records)
            teacher.subject_records.set(subject_records)
            TeacherTeachingAssignment.objects.bulk_create([
                TeacherTeachingAssignment(
                    school=school,
                    teacher=teacher,
                    section_id=assignment['sectionId'],
                    subject_id=assignment['subjectId'],
                    created_by=created_by,
                )
                for assignment in teaching_assignments
            ])
        except IntegrityError as exc:
            if email and User.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError({
                    'email': 'Email already exists.',
                }) from exc
            if data.get('phone') and Teacher.objects.filter(phone__iexact=data['phone'], school=school).exists():
                raise serializers.ValidationError({
                    'phone': 'Phone number already exists.',
                }) from exc
            if any(
                TeacherTeachingAssignment.objects.filter(
                    school=school,
                    section_id=assignment['sectionId'],
                    subject_id=assignment['subjectId'],
                ).exists()
                for assignment in teaching_assignments
            ):
                raise serializers.ValidationError({
                    'teachingAssignments': 'One or more selected class-section and subject assignments are already assigned to another teacher.',
                }) from exc
            raise serializers.ValidationError({
                'detail': 'The teacher account could not be created because a unique record already exists.',
            }) from exc

    return teacher, {
        'username': credentials['login_id'],
        'password': credentials['plaintext_password'],
        'userId': user.id,
        'mustChangePassword': credentials.get('mustChangePassword', True),
    }
