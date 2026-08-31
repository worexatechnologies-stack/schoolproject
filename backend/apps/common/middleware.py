"""Request-level JWT security controls shared by every DRF view."""
from django.db import connection, transaction
from django.http import JsonResponse
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


PASSWORD_CHANGE_PATHS = {
    '/api/v1/auth/change-password/',
    '/api/v1/auth/logout/',
}
class JwtTenantSecurityMiddleware:
    """Authenticate bearer tokens early, enforce temporary-password state, and set RLS context."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt_authentication = JWTAuthentication()

    def _authenticated_user(self, request):
        if getattr(request.user, 'is_authenticated', False):
            return request.user
        try:
            authenticated = self.jwt_authentication.authenticate(request)
        except AuthenticationFailed:
            return None
        if authenticated is None:
            return None
        user, _token = authenticated
        request.user = user
        return user

    def __call__(self, request):
        user = self._authenticated_user(request)
        if user and user.must_change_password and request.path not in PASSWORD_CHANGE_PATHS:
            return JsonResponse(
                {'detail': 'You must change your temporary password before continuing.'},
                status=403,
            )

        if not user or connection.vendor != 'postgresql':
            return self.get_response(request)

        # SET LOCAL is transaction-scoped, so a reused database connection can never
        # carry a previous request's tenant identity.
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET LOCAL app.school_id = %s', [str(user.school_id or '')])
                cursor.execute(
                    'SET LOCAL app.is_superadmin = %s',
                    ['true' if user.role == 'super_admin' else 'false'],
                )
            return self.get_response(request)
