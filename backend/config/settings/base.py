from datetime import timedelta
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parents[2]
env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / '.env')
SECRET_KEY = env('DJANGO_SECRET_KEY')
DEBUG = env('DJANGO_DEBUG')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])
INSTALLED_APPS = ['daphne', 'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'rest_framework', 'rest_framework_simplejwt.token_blacklist', 'drf_spectacular', 'corsheaders', 'django_filters', 'channels', 'apps.accounts', 'apps.schools', 'apps.sis', 'apps.academics', 'apps.timetable', 'apps.attendance', 'apps.lms', 'apps.finance', 'apps.exams', 'apps.promotion', 'apps.chat', 'apps.library', 'apps.transport', 'apps.superadmin', 'apps.public_learning', 'apps.staff', 'apps.notifications', 'apps.community']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'corsheaders.middleware.CorsMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'apps.common.middleware.JwtTenantSecurityMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION, ASGI_APPLICATION = 'config.wsgi.application', 'config.asgi.application'
DATABASES = {'default': env.db('DATABASE_URL', default='postgres://volpehub_education:change-me@db:5432/volpehub_education')}
DATABASES['default']['CONN_MAX_AGE'] = env.int('DB_CONN_MAX_AGE', default=120)
DATABASES['default']['CONN_HEALTH_CHECKS'] = True
AUTH_USER_MODEL = 'accounts.User'
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE, TIME_ZONE, USE_I18N, USE_TZ = 'en-us', 'Asia/Kolkata', True, True
STATIC_URL, STATIC_ROOT = '/static/', BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
CORS_ALLOW_ALL_ORIGINS = env.bool('CORS_ALLOW_ALL_ORIGINS', default=True)
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=['http://localhost:3000'])
CSRF_TRUSTED_ORIGINS = env.list('CSRF_TRUSTED_ORIGINS', default=[])
LOGIN_THROTTLE_RATE = env('LOGIN_THROTTLE_RATE', default='10/min')
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework_simplejwt.authentication.JWTAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.ScopedRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {
        # Configurable per deployment. This protects against password guessing
        # without locking out a shared school/office IP after a few retries.
        'login': LOGIN_THROTTLE_RATE,
        'credential_management': '10/hour',
        'parent_chatbot': '20/hour',
        'fcm_device': '30/hour',
    },
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}
SPECTACULAR_SETTINGS = {'TITLE': 'Volpehub Education ERP API', 'VERSION': 'v1'}
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}
# Production-grade refresh-token configuration. The refresh token is sent
# ONLY as an HttpOnly, Secure (in prod), SameSite=Lax cookie and is stored
# in the DB as a bcrypt hash (never the raw JWT).
REFRESH_TOKEN_LIFETIME_DAYS = 30
REFRESH_COOKIE_NAME = 'refresh_token_cookie'
REFRESH_COOKIE_HTTPONLY = True
REFRESH_COOKIE_SECURE = not DEBUG
REFRESH_COOKIE_SAMESITE = 'Lax'
REFRESH_COOKIE_PATH = '/api/v1/auth/'
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'django.contrib.auth.hashers.ScryptPasswordHasher',
]
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
CELERY_BROKER_URL = env('REDIS_URL', default='redis://redis:6379/0')
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
FIREBASE_ENABLED = env.bool('FIREBASE_ENABLED', default=False)
# Supply exactly one service-account source in deployment. These are server-only
# values; VITE_ Firebase configuration must never be used by Django.
FIREBASE_SERVICE_ACCOUNT_JSON = env('FIREBASE_SERVICE_ACCOUNT_JSON', default='')
FIREBASE_SERVICE_ACCOUNT_FILE = env('FIREBASE_SERVICE_ACCOUNT_FILE', default='')
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
