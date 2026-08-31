from django.db import models
class Student(models.Model):
    class Status(models.TextChoices): ACTIVE = 'Active'; PROMOTED = 'Promoted'; TC_ISSUED = 'TC_Issued'
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='students')
    admission_no = models.CharField(max_length=50)
    name = models.CharField(max_length=160)
    # Profile images are stored directly in PostgreSQL, never in MEDIA_ROOT.
    photo_data = models.BinaryField(blank=True, null=True, editable=False)
    photo_content_type = models.CharField(max_length=32, blank=True)
    class_name = models.CharField(max_length=40)
    section = models.CharField(max_length=40)
    # Canonical section assignment. Legacy class/section text remains for API
    # compatibility and reporting while all new admissions use this relation.
    section_record = models.ForeignKey(
        'academics.Section', on_delete=models.SET_NULL, related_name='students',
        null=True, blank=True,
    )
    roll_no = models.PositiveIntegerField()
    parent_name = models.CharField(max_length=160)
    parent_phone = models.CharField(max_length=30)
    parent_email = models.EmailField()
    dob = models.DateField()
    gender = models.CharField(max_length=32)
    address = models.TextField(blank=True)
    medical_conditions = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    academic_year = models.CharField(max_length=40)
    attendance_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    fee_total = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    fee_paid = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    gpa = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=['school', 'admission_no', 'academic_year'], name='unique_admission_year')]
        indexes = [
            models.Index(fields=['school', 'class_name', 'section']),
            models.Index(fields=['school', 'academic_year']),
            models.Index(fields=['school', 'status'], name='sis_student_school_status_idx'),
        ]

class StudentDocument(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='documents')
    name = models.CharField(max_length=160)
    # Documents are kept in PostgreSQL and served only through the authorized
    # download endpoint. No application upload is written to the local disk.
    file_data = models.BinaryField(blank=True, null=True, editable=False)
    file_content_type = models.CharField(max_length=255, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=16, default='Pending')
    file_type = models.CharField(max_length=12)

class AcademicHistory(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='history')
    academic_year = models.CharField(max_length=40)
    class_name = models.CharField(max_length=40)
    section = models.CharField(max_length=40)
    gpa = models.DecimalField(max_digits=4, decimal_places=2, null=True)
    attendance = models.DecimalField(max_digits=5, decimal_places=2, null=True)
    status = models.CharField(max_length=32)
