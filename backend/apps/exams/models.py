from django.conf import settings
from django.db import models


class ExamSchedule(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PUBLISHED = 'published', 'Published'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='exam_schedules')
    name = models.CharField(max_length=160)
    classroom = models.ForeignKey('academics.Class', on_delete=models.CASCADE, related_name='exam_schedules')
    class_name = models.CharField(max_length=80)
    academic_year = models.CharField(max_length=40, default='2026-2027')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    hall_tickets_generated = models.BooleanField(default=False)
    hall_tickets_released = models.BooleanField(default=False)
    hall_tickets_released_at = models.DateTimeField(null=True, blank=True)
    marks_published = models.BooleanField(default=False)
    marks_published_at = models.DateTimeField(null=True, blank=True)
    report_cards_generated = models.BooleanField(default=False)
    report_cards_published = models.BooleanField(default=False)
    report_cards_published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['school', 'status'], name='exam_sched_school_status_idx'),
            models.Index(fields=['school', 'classroom', 'status'], name='exam_sched_school_cls_stat_idx'),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} - {self.class_name} ({self.status})"


class ExamScheduleItem(models.Model):
    schedule = models.ForeignKey(ExamSchedule, on_delete=models.CASCADE, related_name='items')
    subject = models.ForeignKey('academics.Subject', on_delete=models.SET_NULL, null=True, blank=True, related_name='exam_schedule_items')
    subject_name = models.CharField(max_length=100)
    exam_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    max_marks = models.PositiveIntegerField(default=100)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['exam_date', 'start_time', 'order']

    def __str__(self):
        return f"{self.schedule.name} - {self.subject_name} ({self.exam_date})"


class Exam(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='exams')
    schedule = models.ForeignKey(ExamSchedule, on_delete=models.SET_NULL, null=True, blank=True, related_name='exams')
    name = models.CharField(max_length=160)
    class_name = models.CharField(max_length=40)
    section = models.CharField(max_length=40)
    subject = models.CharField(max_length=100)
    date = models.DateField()
    time = models.TimeField()
    end_time = models.TimeField(null=True, blank=True)
    max_marks = models.PositiveIntegerField()

    class Meta:
        indexes = [
            models.Index(fields=['school', '-date'], name='exams_school_date_idx'),
            models.Index(fields=['school', 'class_name', 'section'], name='exams_school_class_section_idx'),
        ]


class ExamResult(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SUBMITTED = 'submitted', 'Submitted'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='exam_results')
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='results')
    student = models.ForeignKey('sis.Student', on_delete=models.CASCADE, related_name='exam_results')
    marks_obtained = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    remarks = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    entered_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='entered_exam_results')
    entered_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['exam', 'student'], name='unique_exam_result_per_student')]
        indexes = [models.Index(fields=['school', 'student'])]
