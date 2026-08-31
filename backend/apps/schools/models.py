from django.db import models
class School(models.Model):
    name = models.CharField(max_length=160)
    code = models.SlugField(unique=True)
    subdomain = models.SlugField(unique=True, blank=True, null=True)
    icon = models.CharField(max_length=40, default='School')
    # Logos are stored directly in PostgreSQL, never in MEDIA_ROOT.
    logo_data = models.BinaryField(blank=True, null=True, editable=False)
    logo_content_type = models.CharField(max_length=32, blank=True)
    primary_color = models.CharField(max_length=7, default='#6366f1')
    secondary_color = models.CharField(max_length=7, default='#10b981')
    theme = models.CharField(max_length=32, default='glass-academy')
    is_active = models.BooleanField(default=True)
    is_demo = models.BooleanField(default=False, help_text='Marks sales/staging data that can be safely removed.')
    created_at = models.DateTimeField(auto_now_add=True)
