import re
from io import BytesIO

from django.db import transaction
from django.http import FileResponse, Http404, HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from apps.accounts.models import ParentProfile, User
from apps.common.tenancy import TenantScopedViewSet
from .access import teacher_can_access_student, teacher_student_queryset
from .models import Student, StudentDocument
from .serializers import (
    DocumentSerializer,
    StudentDocumentUploadSerializer,
    StudentSerializer,
    TeacherStudentSerializer,
)
from .services import create_or_link_parent_login, create_student_login, deactivate_login_if_student_left


def next_available_admission_no(*, school, academic_year, proposed: str) -> str:
    """Allocate the next sequence value for UI-generated admission numbers."""
    match = re.fullmatch(r'(.+?)(\d+)', proposed)
    if not match:
        return proposed
    prefix, digits = match.groups()
    width = len(digits)
    highest = int(digits)
    for value in Student.objects.filter(
        school=school,
        academic_year=academic_year,
        admission_no__startswith=prefix,
    ).values_list('admission_no', flat=True):
        candidate = re.fullmatch(rf'{re.escape(prefix)}(\d+)', value)
        if candidate:
            highest = max(highest, int(candidate.group(1)))
    return f'{prefix}{highest + 1:0{width}d}'


class CanAdmitStudents(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role == User.Role.SUPER_ADMIN:
            # Platform reporting may read the cross-school roster, but all
            # student lifecycle changes remain owned by the School Admin.
            return request.method in permissions.SAFE_METHODS
        if view.action == 'create':
            return request.user.role == User.Role.SCHOOL_ADMIN
        return request.user.role in [
            User.Role.SCHOOL_ADMIN, User.Role.TEACHER,
            User.Role.PARENT, User.Role.STUDENT,
        ]

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return True
        if user.role == User.Role.STUDENT:
            return getattr(user, 'student_profile', None) and user.student_profile.student_id == obj.id and request.method in permissions.SAFE_METHODS
        if user.role == User.Role.PARENT:
            return getattr(user, 'parent_profile', None) and user.parent_profile.students.filter(pk=obj.pk).exists() and request.method in permissions.SAFE_METHODS
        if user.role == User.Role.TEACHER:
            profile = getattr(user, 'teacher_profile', None)
            return teacher_can_access_student(profile, obj) and request.method in permissions.SAFE_METHODS
        return False

class StudentViewSet(TenantScopedViewSet):
    serializer_class = StudentSerializer
    permission_classes = [CanAdmitStudents]
    queryset = Student.objects.select_related(
        'school', 'section_record', 'section_record__class_room',
    ).order_by('-id')
    filterset_fields = ['class_name', 'section', 'academic_year', 'status']
    search_fields = ['name', 'admission_no', 'parent_name']

    def get_serializer_class(self):
        user = getattr(self.request, 'user', None)
        if user and user.is_authenticated and user.role == User.Role.TEACHER:
            return TeacherStudentSerializer
        return StudentSerializer

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Student.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return Student.objects.none()
        qs = super().get_queryset()
        if user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return qs.prefetch_related('documents', 'history')
        if user.role == User.Role.STUDENT:
            profile = getattr(user, 'student_profile', None)
            return qs.filter(pk=profile.student_id).prefetch_related('documents', 'history') if profile else qs.none()
        if user.role == User.Role.PARENT:
            profile = getattr(user, 'parent_profile', None)
            return qs.filter(parent_profiles=profile).prefetch_related('documents', 'history').distinct() if profile else qs.none()
        if user.role == User.Role.TEACHER:
            profile = getattr(user, 'teacher_profile', None)
            return teacher_student_queryset(profile, qs, school_id=user.school_id).select_related(None).only(
                'id', 'school_id', 'section_record_id', 'admission_no', 'name',
                'photo_content_type', 'class_name', 'section', 'roll_no',
                'parent_name', 'parent_phone', 'dob', 'gender', 'status',
                'academic_year',
            )
        return qs.none()
    def create(self, request, *args, **kwargs):
        payload = request.data.copy()
        school = request.user.school
        if not school:
            # A school tenant is mandatory. We never silently fall back to
            # ``School.objects.first()`` because that would attach a student
            # to an unrelated school and break tenant isolation.
            return Response(
                {'detail': 'A school tenant is required to admit students.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        requested_admission_no = str(payload.get('admissionNo', '')).strip()
        academic_year = str(payload.get('academicYear', '')).strip()
        admission_number_adjusted = False
        if requested_admission_no and academic_year and Student.objects.filter(
            school=school,
            admission_no=requested_admission_no,
            academic_year=academic_year,
        ).exists():
            allocated_admission_no = next_available_admission_no(
                school=school,
                academic_year=academic_year,
                proposed=requested_admission_no,
            )
            if allocated_admission_no != requested_admission_no:
                payload['admissionNo'] = allocated_admission_no
                admission_number_adjusted = True

        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            student = serializer.save(school=school)
            student_credentials = create_student_login(student)
            parent_credentials = create_or_link_parent_login(student)

        response_serializer = self.get_serializer(student)
        headers = self.get_success_headers(response_serializer.data)
        data = response_serializer.data
        data['loginCredentials'] = {
            'student': student_credentials,
            'parent': parent_credentials,
        }
        if admission_number_adjusted:
            data['admissionNumberAdjusted'] = True
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_update(self, serializer):
        student = serializer.save()
        if student.status == Student.Status.TC_ISSUED:
            deactivate_login_if_student_left(student)

    @action(detail=True, methods=['get'], url_path='photo')
    def photo(self, request, pk=None):
        student = self.get_object()
        if not student.photo_data:
            raise Http404
        response = HttpResponse(bytes(student.photo_data), content_type=student.photo_content_type or 'image/webp')
        response['Cache-Control'] = 'private, max-age=300'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @action(detail=True, methods=['get'], url_path='fee-summary')
    def fee_summary(self, request, pk=None):
        student = self.get_object()
        from apps.finance.views import get_student_fee_summary
        summary = get_student_fee_summary(student)
        return Response(summary)

    def destroy(self, request, *args, **kwargs):
        """Delete an admission and any login identities made orphaned by it."""
        student = self.get_object()
        student_profile = getattr(student, 'login_profile', None)
        student_user_id = student_profile.user_id if student_profile else None
        parent_profile_ids = list(student.parent_profiles.values_list('id', flat=True))

        with transaction.atomic():
            self.perform_destroy(student)
            if student_user_id:
                User.objects.filter(pk=student_user_id).delete()

            # A parent with another enrolled child keeps the same shared login.
            # Remove only identities that no longer have a student relationship.
            orphan_parent_user_ids = ParentProfile.objects.filter(
                pk__in=parent_profile_ids,
                students__isnull=True,
            ).values_list('user_id', flat=True)
            User.objects.filter(pk__in=orphan_parent_user_ids).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentDocumentDownloadView(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={
        200: OpenApiResponse(response=OpenApiTypes.BINARY, description='Authorized student document download'),
        403: OpenApiResponse(description='Forbidden'),
        404: OpenApiResponse(description='Not found'),
    })
    def retrieve(self, request, student_id=None, doc_id=None):
        document = StudentDocument.objects.select_related('student').filter(pk=doc_id, student_id=student_id).first()
        if not document:
            raise Http404
        student, user = document.student, request.user
        if user.role == User.Role.SUPER_ADMIN:
            return Response({'detail': 'Super Admins cannot access student documents.'}, status=status.HTTP_403_FORBIDDEN)
        if user.school_id != student.school_id:
            raise Http404
        allowed = user.role == User.Role.SCHOOL_ADMIN
        if user.role == User.Role.PARENT:
            allowed = hasattr(user, 'parent_profile') and user.parent_profile.students.filter(pk=student.pk).exists()
        elif user.role == User.Role.STUDENT:
            allowed = hasattr(user, 'student_profile') and user.student_profile.student_id == student.pk
        if not allowed:
            raise Http404
        if not document.file_data:
            raise Http404
        response = FileResponse(
            BytesIO(bytes(document.file_data)),
            as_attachment=True,
            filename=document.file_name or document.name,
            content_type=document.file_content_type or 'application/octet-stream',
        )
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    @extend_schema(request=None, responses={
        204: None,
        403: OpenApiResponse(description='Forbidden'),
        404: OpenApiResponse(description='Not found'),
    })
    def destroy(self, request, student_id=None, doc_id=None):
        if request.user.role != User.Role.SCHOOL_ADMIN:
            return Response({'detail': 'Only school administrators can delete student documents.'}, status=status.HTTP_403_FORBIDDEN)
        document = StudentDocument.objects.filter(pk=doc_id, student_id=student_id, student__school_id=request.user.school_id).first()
        if not document:
            raise Http404
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentDocumentCollectionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'credential_management'

    @extend_schema(request=StudentDocumentUploadSerializer, responses={201: DocumentSerializer, 403: OpenApiResponse(description='Forbidden'), 404: OpenApiResponse(description='Not found')})
    def post(self, request, student_id=None):
        if request.user.role != User.Role.SCHOOL_ADMIN:
            return Response({'detail': 'Only school administrators can upload student documents.'}, status=status.HTTP_403_FORBIDDEN)
        student = Student.objects.filter(pk=student_id, school_id=request.user.school_id).first()
        if not student:
            raise Http404
        serializer = StudentDocumentUploadSerializer(data=request.data, context={'student': student})
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        return Response(DocumentSerializer(document, context={'request': request}).data, status=status.HTTP_201_CREATED)
