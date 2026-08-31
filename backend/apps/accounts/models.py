from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Super Admin'
        SCHOOL_ADMIN = 'school_admin', 'School Admin'
        TEACHER = 'teacher', 'Teacher'
        PARENT = 'parent', 'Parent'
        STUDENT = 'student', 'Student'
        PUBLIC_LEARNER = 'public_learner', 'Public Learner'
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=24, choices=Role.choices)
    school = models.ForeignKey('schools.School', null=True, blank=True, on_delete=models.SET_NULL, related_name='users')
    permissions_override = models.JSONField(default=list, blank=True)
    must_change_password = models.BooleanField(default=False)
    is_online = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'role']

    @property
    def frontend_role(self):
        return self.get_role_display()

    @property
    def is_online_computed(self) -> bool:
        if not self.is_active or not self.is_online or not self.last_seen_at:
            return False
        from django.utils import timezone
        from datetime import timedelta
        return self.last_seen_at >= timezone.now() - timedelta(seconds=45)


class StudentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile')
    student = models.OneToOneField('sis.Student', on_delete=models.CASCADE, related_name='login_profile')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['student', 'user'])]


class ParentProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='parent_profile')
    # A parent may have children at more than one school.  The identity is
    # tenant-owned through ``user.school``, so phone numbers must not cause a
    # profile from one school to be linked to a student in another.
    phone = models.CharField(max_length=30)
    students = models.ManyToManyField('sis.Student', related_name='parent_profiles', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['phone'])]


class RefreshTokenRecord(models.Model):
    """A single device session backed by a hashed refresh token.

    Security model
    --------------
    * We NEVER store the raw refresh token (JWT string) in the database.
    * We store a bcrypt hash of the token so a database leak does not leak
      usable refresh tokens.
    * A user can have multiple active refresh-token records (one per device),
      which is why we key on a unique random ``jti`` when issuing tokens.
    """

    class Meta:
        indexes = [
            models.Index(fields=['user', 'revoked_at']),
            models.Index(fields=['jti'], name='accounts_rt_jti_idx'),
        ]
        ordering = ['-created_at']

    # The unique identifier stamped into the JWT ``jti`` claim. We look up
    # the record by jti, then compare bcrypt hashes, so we never need to
    # search by raw token contents.
    jti = models.UUIDField(unique=True)

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='refresh_token_records',
    )

    # bcrypt hash of the refresh token value. The raw JWT is never persisted.
    token_hash = models.CharField(max_length=128)

    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    device = models.CharField(max_length=255, blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def verify_token(self, raw_token: str) -> bool:
        """Return True when the supplied raw JWT matches the stored hash."""
        if not self.is_active:
            return False
        try:
            import bcrypt
            import hashlib
            token_bytes = hashlib.sha256(raw_token.encode('utf-8')).hexdigest().encode('utf-8')
            return bcrypt.checkpw(
                token_bytes, self.token_hash.encode('utf-8')
            )
        except ValueError:
            return False

    def revoke(self) -> None:
        """Revoke this device session (logout / reuse detection)."""
        from django.utils import timezone
        self.revoked_at = timezone.now()
        self.save(update_fields=['revoked_at'])
