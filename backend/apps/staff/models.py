from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

class Teacher(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'Active', 'Active'
        INACTIVE = 'Inactive', 'Inactive'

    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='teachers')
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='teacher_profile')
    subjects = models.JSONField(default=list, blank=True)
    subject_records = models.ManyToManyField('academics.Subject', related_name='teachers', blank=True)
    assigned_sections = models.JSONField(default=list, blank=True)
    # Canonical assignments used for authorization. The JSON field above is
    # retained temporarily so older records can be migrated safely.
    sections = models.ManyToManyField('academics.Section', related_name='teachers', blank=True)
    qualification = models.CharField(max_length=255, blank=True)
    joining_date = models.DateField()
    phone = models.CharField(max_length=30)
    # Retained only to preserve old free-text notes during the database
    # transition. Actual teacher documents are stored as bytes below.
    legacy_document_notes = models.JSONField(default=list, blank=True)
    # Profile images are stored directly in PostgreSQL, never in MEDIA_ROOT.
    photo_data = models.BinaryField(blank=True, null=True, editable=False)
    photo_content_type = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['school', 'status']),
            models.Index(fields=['school', 'phone']),
        ]


class TeacherTeachingAssignment(models.Model):
    """An exact subject a teacher is authorized to teach in one section."""

    school = models.ForeignKey(
        'schools.School', on_delete=models.CASCADE,
        related_name='teacher_teaching_assignments',
    )
    teacher = models.ForeignKey(
        Teacher, on_delete=models.CASCADE, related_name='teaching_assignments',
    )
    section = models.ForeignKey(
        'academics.Section', on_delete=models.CASCADE,
        related_name='teacher_assignments',
    )
    subject = models.ForeignKey(
        'academics.Subject', on_delete=models.CASCADE,
        related_name='teacher_assignments',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='created_teacher_teaching_assignments',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['school', 'teacher', 'section', 'subject'],
                name='unique_teacher_section_subject_assignment',
            ),
            models.UniqueConstraint(
                fields=['school', 'section', 'subject'],
                name='unique_teacher_for_section_subject',
            ),
        ]
        indexes = [
            models.Index(
                fields=['school', 'teacher'], name='staff_assignment_teacher_idx',
            ),
            models.Index(
                fields=['school', 'section', 'subject'],
                name='staff_assignment_scope_idx',
            ),
        ]
        ordering = ['section_id', 'subject_id', 'id']

    def clean(self):
        relation_school_ids = {
            self.teacher.school_id if self.teacher_id else None,
            self.section.school_id if self.section_id else None,
            self.subject.school_id if self.subject_id else None,
        }
        relation_school_ids.discard(None)
        if self.school_id and any(
            school_id != self.school_id for school_id in relation_school_ids
        ):
            raise ValidationError(
                'Teacher, section, subject, and assignment must belong to one school.',
            )
        if (
            self.section_id and self.subject_id
            and not self.section.class_room.subjects.filter(pk=self.subject_id).exists()
        ):
            raise ValidationError({
                'subject': 'Subject is not configured for the selected section class.',
            })
        if (
            self.created_by_id and self.created_by.school_id
            and self.created_by.school_id != self.school_id
        ):
            raise ValidationError({'created_by': 'Creator is outside the assignment tenant.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class TeacherDocument(models.Model):
    """A verified teacher document stored directly in PostgreSQL."""

    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name='documents')
    name = models.CharField(max_length=160)
    file_data = models.BinaryField(editable=False)
    file_content_type = models.CharField(max_length=100)
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=16)
    status = models.CharField(max_length=16, default='Uploaded')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['teacher', 'created_at'])]
        ordering = ['-created_at']
