import logging

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from django.http import Http404, HttpResponse
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from .models import School
from .serializers import SchoolSerializer


logger = logging.getLogger(__name__)

class IsSuperAdminOnly(BasePermission):
    """Only the platform operator may mutate schools."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.role == 'super_admin'


class SchoolViewSet(viewsets.ModelViewSet):
    serializer_class, permission_classes = SchoolSerializer, [IsSuperAdminOnly]
    queryset = School.objects.all().order_by('name')
    def get_queryset(self):
        qs = super().get_queryset()
        return qs if self.request.user.role == 'super_admin' else qs.filter(pk=self.request.user.school_id)

    @action(detail=True, methods=['get'], url_path='logo')
    def logo(self, request, pk=None):
        school = self.get_object()
        if not school.logo_data:
            raise Http404
        response = HttpResponse(bytes(school.logo_data), content_type=school.logo_content_type or 'image/webp')
        response['Cache-Control'] = 'private, max-age=300'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def destroy(self, request, *args, **kwargs):
        """Permanently remove exactly one school and its tenant-owned records."""
        school = self.get_object()
        if request.data.get('confirmation') != school.code:
            return Response(
                {'detail': f'Type the school code "{school.code}" to permanently delete this school.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # User.school is SET_NULL by design for ordinary lifecycle changes.
            # A confirmed permanent school deletion intentionally removes every
            # tenant identity before the School cascade deletes tenant records.
            users = User.objects.filter(school=school)
            user_count = users.count()
            users.delete()
            school_name, school_code, school_id = school.name, school.code, school.pk
            school.delete()

        logger.warning(
            'school_permanently_deleted actor_user_id=%s school_id=%s school_code=%s deleted_user_count=%s',
            request.user.pk, school_id, school_code, user_count,
        )
        return Response(
            {'detail': f'School "{school_name}" and its related data were permanently deleted.'},
            status=status.HTTP_200_OK,
        )
