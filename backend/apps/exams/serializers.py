from rest_framework import serializers
from apps.academics.models import Class, Section, Subject
from .models import Exam, ExamResult, ExamSchedule, ExamScheduleItem


class ExamScheduleItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), required=False, allow_null=True)

    class Meta:
        model = ExamScheduleItem
        fields = [
            'id', 'subject', 'subject_name',
            'exam_date', 'start_time', 'end_time', 'max_marks', 'order',
        ]

    def validate(self, attrs):
        start_time = attrs.get('start_time')
        end_time = attrs.get('end_time')
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({'end_time': 'End time must be later than start time.'})
        max_marks = attrs.get('max_marks')
        if max_marks is not None and max_marks < 1:
            raise serializers.ValidationError({'max_marks': 'Maximum marks must be at least 1.'})
        return attrs


class ExamScheduleSerializer(serializers.ModelSerializer):
    items = ExamScheduleItemSerializer(many=True, required=False)
    sections = serializers.SerializerMethodField()
    classroom_name = serializers.CharField(source='classroom.name', read_only=True)
    class_name = serializers.CharField(required=False)

    class Meta:
        model = ExamSchedule
        fields = [
            'id', 'name', 'classroom', 'classroom_name', 'class_name',
            'academic_year', 'status', 'published_at',
            'hall_tickets_generated', 'hall_tickets_released', 'hall_tickets_released_at',
            'marks_published', 'marks_published_at',
            'report_cards_generated', 'report_cards_published', 'report_cards_published_at',
            'items', 'sections',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_sections(self, obj):
        if not obj.classroom:
            return []
        return list(obj.classroom.sections.filter(school_id=obj.school_id).values_list('name', flat=True).order_by('name'))

    def validate(self, attrs):
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        classroom = attrs.get('classroom', getattr(self.instance, 'classroom', None))
        if classroom and school_id and classroom.school_id != school_id:
            raise serializers.ValidationError({'classroom': 'Classroom does not belong to your school.'})
        if classroom:
            attrs['class_name'] = classroom.name
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        schedule = ExamSchedule.objects.create(**validated_data)
        for index, item_data in enumerate(items_data):
            item_data.setdefault('order', index)
            ExamScheduleItem.objects.create(schedule=schedule, **item_data)
        return schedule

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            existing_ids = set()
            for index, item_data in enumerate(items_data):
                item_id = item_data.get('id')
                if item_id and instance.items.filter(id=item_id).exists():
                    item = instance.items.get(id=item_id)
                    for k, v in item_data.items():
                        if k != 'id':
                            setattr(item, k, v)
                    if 'order' not in item_data:
                        item.order = index
                    item.save()
                    existing_ids.add(item.id)
                else:
                    item_data.pop('id', None)
                    item_data.setdefault('order', index)
                    new_item = ExamScheduleItem.objects.create(schedule=instance, **item_data)
                    existing_ids.add(new_item.id)
            instance.items.exclude(id__in=existing_ids).delete()

        return instance


class ExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exam
        fields = ['id', 'schedule', 'name', 'class_name', 'section', 'subject', 'date', 'time', 'end_time', 'max_marks']

    def validate(self, attrs):
        school_id = getattr(getattr(self.context.get('request'), 'user', None), 'school_id', None)
        class_name = attrs.get('class_name', getattr(self.instance, 'class_name', '')).strip()
        section_name = attrs.get('section', getattr(self.instance, 'section', '')).strip()
        subject_name = attrs.get('subject', getattr(self.instance, 'subject', '')).strip()

        classroom = Class.objects.filter(school_id=school_id, name__iexact=class_name).first()
        if not classroom:
            raise serializers.ValidationError({'class_name': 'Select a class created in Academic Setup.'})
        section = Section.objects.filter(
            school_id=school_id, class_room=classroom, name__iexact=section_name,
        ).first()
        if not section:
            raise serializers.ValidationError({'section': 'Select a section assigned to this class.'})
        subject = Subject.objects.filter(school_id=school_id, name__iexact=subject_name).first()
        if not subject:
            raise serializers.ValidationError({'subject': 'Select a subject created by the School Admin.'})
        if not classroom.subjects.filter(pk=subject.pk).exists():
            raise serializers.ValidationError({'subject': 'Select a subject assigned to this class in Academic Setup.'})

        attrs['class_name'] = classroom.name
        attrs['section'] = section.name
        attrs['subject'] = subject.name
        return attrs


class ExamResultSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    admission_no = serializers.CharField(source='student.admission_no', read_only=True)
    exam_id = serializers.IntegerField(source='exam.id', read_only=True)
    exam_name = serializers.CharField(source='exam.name', read_only=True)
    subject = serializers.CharField(source='exam.subject', read_only=True)
    max_marks = serializers.IntegerField(source='exam.max_marks', read_only=True)
    exam_date = serializers.DateField(source='exam.date', read_only=True)

    class Meta:
        model = ExamResult
        fields = ['student', 'student_name', 'admission_no', 'exam_id', 'exam_name', 'subject', 'max_marks', 'exam_date', 'marks_obtained', 'remarks', 'status', 'submitted_at']
