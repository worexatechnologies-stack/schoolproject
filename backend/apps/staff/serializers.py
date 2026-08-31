from pathlib import Path

from rest_framework import serializers

from apps.academics.models import Section, Subject
from apps.accounts.models import User
from apps.common.validators import (
    detected_content_type,
    optimize_raster_image,
    validate_student_document,
    validate_student_photo,
)

from .models import Teacher, TeacherDocument, TeacherTeachingAssignment


def validate_teaching_scope(serializer, attrs):
    """Subjects must be configured for at least one assigned class."""
    instance = getattr(serializer, 'instance', None)
    if instance is not None and not {'sections', 'subject_records'}.intersection(attrs):
        return attrs

    sections = list(attrs.get('sections', instance.sections.all() if instance else []))
    subjects = list(attrs.get('subject_records', instance.subject_records.all() if instance else []))
    if not sections:
        raise serializers.ValidationError({
            'assignedSectionIds': 'Assign at least one class section to this teacher.',
        })

    # Derive the tenant from the sections the caller is assigning. Every
    # section has already passed the school-boundary validator, so all belong
    # to one tenant. Explicitly filtering subjects by that tenant prevents a
    # corrupted/legacy M2M row from ever crossing a school boundary.
    tenant_id = sections[0].school_id if sections else getattr(
        getattr(getattr(serializer, 'instance', None), 'school_id', None), None, None,
    )
    allowed_subject_ids = set(
        Subject.objects.filter(
            school_id=tenant_id,
            classes__sections__in=sections,
        )
        .values_list('pk', flat=True)
    ) if tenant_id else set()
    invalid_subjects = [subject.name for subject in subjects if subject.pk not in allowed_subject_ids]
    if invalid_subjects:
        raise serializers.ValidationError({
            'subjectIds': (
                'These subjects are not assigned to any selected class in Academic Setup: '
                + ', '.join(sorted(invalid_subjects))
            ),
        })
    return attrs


class TeacherDocumentSerializer(serializers.ModelSerializer):
    fileType = serializers.CharField(source='file_type')
    downloadUrl = serializers.SerializerMethodField()

    class Meta:
        model = TeacherDocument
        fields = ['id', 'name', 'status', 'fileType', 'downloadUrl']

    def get_downloadUrl(self, obj) -> str:
        return f'/api/v1/teachers/{obj.teacher_id}/documents/{obj.id}/'


class TeacherDocumentUploadSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    file = serializers.FileField()

    def validate_file(self, value):
        validate_student_document(value)
        return value

    def create(self, validated_data):
        upload = validated_data['file']
        content_type = detected_content_type(upload)
        upload.seek(0)
        return TeacherDocument.objects.create(
            teacher=self.context['teacher'],
            name=validated_data['name'],
            file_data=upload.read(),
            file_content_type=content_type,
            file_name=Path(upload.name).name[:255],
            file_type={
                'application/pdf': 'PDF',
                'image/jpeg': 'JPG',
                'image/png': 'PNG',
            }[content_type],
        )


class TeacherSerializer(serializers.ModelSerializer):
    userId = serializers.IntegerField(source='user_id', read_only=True)
    name = serializers.CharField(source='user.first_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    isOnline = serializers.SerializerMethodField()
    subjects = serializers.SerializerMethodField()
    subjectIds = serializers.PrimaryKeyRelatedField(
        source='subject_records', queryset=Subject.objects.all(), many=True,
        required=False, allow_empty=False,
    )
    assignedSections = serializers.SerializerMethodField()
    assignedSectionIds = serializers.PrimaryKeyRelatedField(
        source='sections', queryset=Section.objects.select_related('class_room'), many=True, required=False,
    )
    joiningDate = serializers.DateField(source='joining_date')
    documents = TeacherDocumentSerializer(many=True, read_only=True)
    photoUrl = serializers.SerializerMethodField()
    teachingAssignments = serializers.SerializerMethodField()
    # Browser-side compression produces WebP.  Use FileField here so DRF does
    # not reject that valid format before our byte-signature and Pillow checks
    # below run; validate_student_photo remains the security boundary.
    photo = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Teacher
        fields = ['id', 'userId', 'name', 'email', 'isOnline', 'phone', 'subjects', 'subjectIds', 'assignedSections', 'assignedSectionIds', 'teachingAssignments', 'qualification', 'joiningDate', 'documents', 'status', 'photoUrl', 'photo']

    def get_isOnline(self, obj) -> bool:
        if not obj.user:
            return False
        return obj.user.is_online_computed

    def get_fields(self):
        fields = super().get_fields()
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        fields['subjectIds'].child_relation.queryset = (
            Subject.objects.filter(school_id=school_id) if school_id else Subject.objects.none()
        )
        fields['assignedSectionIds'].child_relation.queryset = (
            Section.objects.filter(school_id=school_id).select_related('class_room')
            if school_id else Section.objects.none()
        )
        return fields

    def get_subjects(self, obj) -> list[str]:
        subjects = list(obj.subject_records.all())
        if subjects:
            return [subject.name for subject in subjects]
        return list(obj.subjects or [])

    def get_assignedSections(self, obj) -> list[str]:
        sections = list(obj.sections.all())
        if sections:
            return [f'{section.class_room.name}-{section.name}' for section in sections]
        return list(obj.assigned_sections or [])

    def get_teachingAssignments(self, obj) -> list[dict]:
        return [
            {
                'id': assignment.id,
                'sectionId': assignment.section_id,
                'subjectId': assignment.subject_id,
                'classId': assignment.section.class_room_id,
                'className': assignment.section.class_room.name,
                'sectionName': assignment.section.name,
                'subjectName': assignment.subject.name,
            }
            for assignment in obj.teaching_assignments.select_related('section__class_room', 'subject')
        ]

    def validate_assignedSectionIds(self, values):
        request = self.context.get('request')
        school_id = getattr(getattr(request, 'user', None), 'school_id', None)
        if school_id and any(section.school_id != school_id for section in values):
            raise serializers.ValidationError('Every assigned section must belong to your school.')
        return values

    def validate_phone(self, value):
        if value:
            clean_phone = value.strip()
            if clean_phone:
                request = self.context.get('request')
                school = getattr(getattr(request, 'user', None), 'school', None)
                qs = Teacher.objects.filter(phone__iexact=clean_phone)
                if school:
                    qs = qs.filter(school=school)
                if self.instance:
                    qs = qs.exclude(pk=self.instance.pk)
                if qs.exists():
                    raise serializers.ValidationError('Phone number already exists.')
                return clean_phone
        return value

    def validate_subjectIds(self, values):
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        if school_id and any(subject.school_id != school_id for subject in values):
            raise serializers.ValidationError('Every assigned subject must belong to your school.')
        return values

    def validate(self, attrs):
        return validate_teaching_scope(self, attrs)
    def get_photoUrl(self, obj) -> str | None:
        if not obj.photo_data:
            return None
        return f'/api/v1/teachers/{obj.pk}/photo/'

    def validate_photo(self, value):
        validate_student_photo(value)
        return value

    @staticmethod
    def _store_photo(instance, photo):
        if photo is None:
            instance.photo_data = None
            instance.photo_content_type = ''
        else:
            instance.photo_data, instance.photo_content_type, _ = optimize_raster_image(photo)
        instance.save(update_fields=['photo_data', 'photo_content_type'])

    def update(self, instance, validated_data):
        photo = validated_data.pop('photo', serializers.empty)
        subject_records = validated_data.get('subject_records', serializers.empty)
        instance = super().update(instance, validated_data)
        if subject_records is not serializers.empty:
            instance.subjects = [subject.name for subject in subject_records]
            instance.save(update_fields=['subjects'])
        if photo is not serializers.empty:
            self._store_photo(instance, photo)
        return instance


class TeacherCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True, write_only=True)
    password = serializers.CharField(min_length=8, max_length=128, write_only=True, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    subjectIds = serializers.PrimaryKeyRelatedField(
        source='subject_records', queryset=Subject.objects.all(), many=True,
        required=True, allow_empty=False,
    )
    assignedSections = serializers.JSONField(source='assigned_sections', required=False, allow_null=True, default=list)
    assignedSectionIds = serializers.PrimaryKeyRelatedField(
        source='sections', queryset=Section.objects.select_related('class_room'), many=True,
        required=True, allow_empty=False,
    )
    teachingAssignments = serializers.JSONField(required=False, write_only=True)
    joiningDate = serializers.DateField(source='joining_date', required=False, allow_null=True)
    qualification = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    status = serializers.ChoiceField(choices=Teacher.Status.choices, required=False, default=Teacher.Status.ACTIVE)
    # See TeacherSerializer.photo: the project validator verifies the actual
    # image bytes rather than trusting the browser-provided MIME type.
    photo = serializers.FileField(required=False, allow_null=True)

    def get_fields(self):
        fields = super().get_fields()
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        fields['subjectIds'].child_relation.queryset = (
            Subject.objects.filter(school_id=school_id) if school_id else Subject.objects.none()
        )
        fields['assignedSectionIds'].child_relation.queryset = (
            Section.objects.filter(school_id=school_id).select_related('class_room')
            if school_id else Section.objects.none()
        )
        return fields

    def validate_photo(self, value):
        validate_student_photo(value)
        return value

    def validate_email(self, value):
        if value:
            clean_email = value.strip().lower()
            if clean_email:
                if User.objects.filter(email__iexact=clean_email).exists() or Teacher.objects.filter(user__email__iexact=clean_email).exists():
                    raise serializers.ValidationError(
                        'Email already exists.'
                    )
                return clean_email
        return value

    def validate_phone(self, value):
        if value:
            clean_phone = value.strip()
            if clean_phone:
                request = self.context.get('request')
                school = getattr(getattr(request, 'user', None), 'school', None)
                qs = Teacher.objects.filter(phone__iexact=clean_phone)
                if school:
                    qs = qs.filter(school=school)
                if qs.exists():
                    raise serializers.ValidationError('Phone number already exists.')
                return clean_phone
        return value

    def validate_assignedSectionIds(self, values):
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        if school_id and any(section.school_id != school_id for section in values):
            raise serializers.ValidationError('Every assigned section must belong to your school.')
        return values

    def validate_subjectIds(self, values):
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        if school_id and any(subject.school_id != school_id for subject in values):
            raise serializers.ValidationError('Every assigned subject must belong to your school.')
        return values

    def validate_teachingAssignments(self, values):
        if not isinstance(values, list) or not values:
            raise serializers.ValidationError('Add at least one class-section and subject assignment.')
        request = self.context.get('request')
        school_id = getattr(getattr(request, 'user', None), 'school_id', None)
        pairs: list[tuple[int, int]] = []
        for value in values:
            if not isinstance(value, dict):
                raise serializers.ValidationError('Each assignment must include a sectionId and subjectId.')
            try:
                pair = (int(value['sectionId']), int(value['subjectId']))
            except (KeyError, TypeError, ValueError) as exc:
                raise serializers.ValidationError('Each assignment must include numeric sectionId and subjectId values.') from exc
            if pair not in pairs:
                pairs.append(pair)

        section_ids = {section_id for section_id, _ in pairs}
        subject_ids = {subject_id for _, subject_id in pairs}
        sections = {
            section.id: section
            for section in Section.objects.filter(school_id=school_id, id__in=section_ids).select_related('class_room')
        }
        subjects = {
            subject.id: subject
            for subject in Subject.objects.filter(school_id=school_id, id__in=subject_ids)
        }
        if len(sections) != len(section_ids) or len(subjects) != len(subject_ids):
            raise serializers.ValidationError('Every assignment must belong to your school.')
        for section_id, subject_id in pairs:
            if not sections[section_id].class_room.subjects.filter(pk=subject_id).exists():
                raise serializers.ValidationError('A selected subject is not assigned to its section class.')
        if TeacherTeachingAssignment.objects.filter(
            school_id=school_id,
            section_id__in=section_ids,
            subject_id__in=subject_ids,
        ).exists():
            conflicts = [
                {'sectionId': section_id, 'subjectId': subject_id}
                for section_id, subject_id in pairs
                if TeacherTeachingAssignment.objects.filter(
                    school_id=school_id, section_id=section_id, subject_id=subject_id,
                ).exists()
            ]
            if conflicts:
                raise serializers.ValidationError({
                    'conflicts': conflicts,
                    'detail': 'A selected class section and subject is already assigned to another teacher.',
                })
        return [{'sectionId': section_id, 'subjectId': subject_id} for section_id, subject_id in pairs]

    def validate(self, attrs):
        attrs = validate_teaching_scope(self, attrs)
        expected_pairs = {
            (section.id, subject.id)
            for section in attrs['sections']
            for subject in attrs['subject_records']
            if section.class_room.subjects.filter(pk=subject.id).exists()
        }
        submitted_assignments = attrs.get('teachingAssignments')
        if submitted_assignments is None:
            attrs['teachingAssignments'] = [
                {'sectionId': section_id, 'subjectId': subject_id}
                for section_id, subject_id in sorted(expected_pairs)
            ]
            return attrs
        assignment_pairs = {(item['sectionId'], item['subjectId']) for item in submitted_assignments}
        if assignment_pairs != expected_pairs:
            raise serializers.ValidationError({
                'teachingAssignments': 'Assignments must exactly match the selected sections and subjects.'
            })
        return attrs


class TeacherCreateResponseSerializer(TeacherSerializer):
    loginCredentials = serializers.DictField(read_only=True)


class TeacherTeachingAssignmentSerializer(serializers.Serializer):
    """Add one exact class-section and subject to an existing teacher."""

    sectionId = serializers.PrimaryKeyRelatedField(
        source='section', queryset=Section.objects.none(),
    )
    subjectId = serializers.PrimaryKeyRelatedField(
        source='subject', queryset=Subject.objects.none(),
    )

    def get_fields(self):
        fields = super().get_fields()
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        fields['sectionId'].queryset = (
            Section.objects.filter(school_id=school_id).select_related('class_room')
            if school_id else Section.objects.none()
        )
        fields['subjectId'].queryset = (
            Subject.objects.filter(school_id=school_id) if school_id else Subject.objects.none()
        )
        return fields

    def validate(self, attrs):
        section = attrs['section']
        subject = attrs['subject']
        if not section.class_room.subjects.filter(pk=subject.pk).exists():
            raise serializers.ValidationError({
                'subjectId': 'This subject is not assigned to the selected class in Academic Setup.',
            })
        return attrs
