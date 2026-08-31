from rest_framework import serializers
from pathlib import Path

from apps.academics.models import AcademicYear, Section
from apps.common.validators import detected_content_type, optimize_raster_image, validate_student_document, validate_student_photo
from .models import Student, StudentDocument, AcademicHistory

class DocumentSerializer(serializers.ModelSerializer):
    fileType = serializers.CharField(source='file_type')
    downloadUrl = serializers.SerializerMethodField()
    def get_downloadUrl(self, obj) -> str:
        return f'/api/v1/students/{obj.student_id}/documents/{obj.id}/'
    class Meta: model = StudentDocument; fields = ['id', 'name', 'status', 'fileType', 'downloadUrl']


class StudentDocumentUploadSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    file = serializers.FileField()

    def validate_file(self, value):
        validate_student_document(value)
        return value

    def create(self, validated_data):
        upload = validated_data['file']
        content_type = detected_content_type(upload)
        upload.seek(0)
        file_data = upload.read()
        return StudentDocument.objects.create(
            student=self.context['student'],
            name=validated_data['name'],
            file_data=file_data,
            file_content_type=content_type,
            file_name=Path(upload.name).name[:255],
            file_type={
                'application/pdf': 'PDF',
                'image/jpeg': 'JPG',
                'image/png': 'PNG',
            }[content_type],
            status='Uploaded',
        )
class HistorySerializer(serializers.ModelSerializer):
    academicYear = serializers.CharField(source='academic_year'); className = serializers.CharField(source='class_name', read_only=True)
    class Meta: model = AcademicHistory; fields = ['academicYear', 'className', 'section', 'gpa', 'attendance', 'status']


class TeacherStudentSerializer(serializers.ModelSerializer):
    """Privacy-minimized student profile exposed to an assigned teacher.

    Teachers need enough information to identify a learner, understand their
    current placement, and contact a guardian.  Financial data, medical notes,
    guardian email addresses, documents, and historical records deliberately
    remain available only through the more privileged/self-service serializer.
    """

    admissionNo = serializers.CharField(source='admission_no', read_only=True)
    className = serializers.CharField(source='class_name', read_only=True)
    sectionId = serializers.IntegerField(source='section_record_id', read_only=True)
    rollNo = serializers.IntegerField(source='roll_no', read_only=True)
    parentName = serializers.CharField(source='parent_name', read_only=True)
    parentPhone = serializers.CharField(source='parent_phone', read_only=True)
    academicYear = serializers.CharField(source='academic_year', read_only=True)
    photoUrl = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'admissionNo', 'name', 'photoUrl', 'className', 'section',
            'sectionId', 'rollNo', 'dob', 'gender', 'status', 'academicYear',
            'parentName', 'parentPhone',
        ]
        read_only_fields = fields

    def get_photoUrl(self, obj) -> str | None:
        # Teacher collection/detail queries intentionally defer the potentially
        # large bytea column. The content type is set atomically with the bytes.
        if not obj.photo_content_type:
            return None
        return f'/api/v1/students/{obj.pk}/photo/'

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['class'] = data.pop('className')
        return data


class StudentSerializer(serializers.ModelSerializer):
    admissionNo = serializers.CharField(source='admission_no'); class_ = serializers.CharField(source='class_name', required=False); rollNo = serializers.IntegerField(source='roll_no')
    section = serializers.CharField(required=False)
    parentName = serializers.CharField(source='parent_name'); parentPhone = serializers.CharField(source='parent_phone'); parentEmail = serializers.EmailField(source='parent_email')
    academicYear = serializers.CharField(source='academic_year'); attendancePercentage = serializers.DecimalField(source='attendance_percentage', max_digits=5, decimal_places=2, required=False); feeTotal = serializers.DecimalField(source='fee_total', max_digits=12, decimal_places=2, required=False); feePaid = serializers.DecimalField(source='fee_paid', max_digits=12, decimal_places=2, required=False)
    documents = DocumentSerializer(many=True, read_only=True); history = HistorySerializer(many=True, read_only=True)
    photoUrl = serializers.SerializerMethodField()
    # Let the shared byte-signature/Pillow validator handle WebP consistently
    # with teacher and school image uploads.
    photo = serializers.FileField(write_only=True, required=False, allow_null=True)
    sectionId = serializers.PrimaryKeyRelatedField(source='section_record', queryset=Section.objects.select_related('class_room'), required=False, allow_null=True)
    classId = serializers.SerializerMethodField()
    class Meta:
        model = Student
        fields = ['id', 'admissionNo', 'name', 'photoUrl', 'photo', 'class_', 'classId', 'section', 'sectionId', 'rollNo', 'parentName', 'parentPhone', 'parentEmail', 'dob', 'gender', 'address', 'medical_conditions', 'status', 'academicYear', 'attendancePercentage', 'feeTotal', 'feePaid', 'gpa', 'documents', 'history']

    def get_classId(self, obj) -> int | None:
        if obj.section_record_id and obj.section_record:
            return obj.section_record.class_room_id
        return None

    def get_photoUrl(self, obj) -> str | None:
        if not obj.photo_data:
            return None
        return f'/api/v1/students/{obj.pk}/photo/'

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

    def create(self, validated_data):
        photo = validated_data.pop('photo', serializers.empty)
        instance = super().create(validated_data)
        if photo is not serializers.empty:
            self._store_photo(instance, photo)
        return instance

    def update(self, instance, validated_data):
        photo = validated_data.pop('photo', serializers.empty)
        instance = super().update(instance, validated_data)
        if photo is not serializers.empty:
            self._store_photo(instance, photo)
        return instance
    def validate(self, attrs):
        request = self.context.get('request')
        school = getattr(getattr(request, 'user', None), 'school', None)
        section_record = attrs.get('section_record', getattr(self.instance, 'section_record', None))
        if section_record:
            if school and section_record.school_id != school.id:
                raise serializers.ValidationError({'sectionId': 'Select a section from your own school.'})
            attrs['class_name'] = section_record.class_room.name
            attrs['section'] = section_record.name
        else:
            raise serializers.ValidationError({'sectionId': 'Select a valid class section.'})

        academic_year_name = attrs.get('academic_year', getattr(self.instance, 'academic_year', '')).strip()
        academic_year = AcademicYear.objects.filter(
            school=school, name__iexact=academic_year_name,
        ).first() if school else None
        if school and not academic_year:
            raise serializers.ValidationError({
                'academicYear': 'Select an academic year created in Academic Setup.',
            })
        if academic_year:
            attrs['academic_year'] = academic_year.name

        admission_no = attrs.get('admission_no', getattr(self.instance, 'admission_no', ''))
        duplicate = Student.objects.filter(
            school=school,
            admission_no=admission_no,
            academic_year=attrs.get('academic_year', academic_year_name),
        )
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if school and duplicate.exists():
            raise serializers.ValidationError({
                'admissionNo': 'This admission number is already used for the selected academic year.',
            })
        return attrs
    def validate_status(self, value):
        if self.instance is None and value != Student.Status.ACTIVE:
            raise serializers.ValidationError('New admission must start as Active.')
        return value
    def to_representation(self, instance):
        data = super().to_representation(instance); data['class'] = data.pop('class_'); data['medicalConditions'] = data.pop('medical_conditions'); return data
