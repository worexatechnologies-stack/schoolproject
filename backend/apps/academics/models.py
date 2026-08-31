from django.db import models


class AcademicYear(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='academic_years')
    name = models.CharField(max_length=20)
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_active = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['school', 'name'], name='unique_school_academic_year'),
            models.UniqueConstraint(
                fields=['school'], condition=models.Q(is_active=True),
                name='unique_active_academic_year_per_school',
            ),
        ]
        indexes = [models.Index(fields=['school', 'is_active'])]
        ordering = ['-starts_on']


class Class(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='classes')
    name = models.CharField(max_length=80)
    code = models.SlugField(max_length=80)
    sort_order = models.PositiveIntegerField(default=0)
    subjects = models.ManyToManyField('Subject', related_name='classes', blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['school', 'code'], name='unique_school_class_code')]
        ordering = ['sort_order', 'name']


class Section(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='sections')
    class_room = models.ForeignKey(Class, on_delete=models.CASCADE, related_name='sections')
    name = models.CharField(max_length=20)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['school', 'class_room', 'name'], name='unique_school_class_section')]
        ordering = ['class_room__name', 'name']

    def clean(self):
        if self.class_room_id and self.school_id and self.class_room.school_id != self.school_id:
            from django.core.exceptions import ValidationError
            raise ValidationError({'class_room': 'Class must belong to the same school as the section.'})


class Subject(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=120)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['school', 'name'], name='unique_school_subject_name')]
        ordering = ['name']
