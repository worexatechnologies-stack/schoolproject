from io import BytesIO

from django.db import transaction
from django.http import FileResponse, Http404, HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema

from apps.accounts.models import User
from apps.common.tenancy import TenantScopedViewSet

from .models import Teacher, TeacherDocument, TeacherTeachingAssignment
from .serializers import (
    TeacherCreateSerializer,
    TeacherDocumentSerializer,
    TeacherDocumentUploadSerializer,
    TeacherSerializer,
    TeacherTeachingAssignmentSerializer,
)
from .services import create_teacher_with_login


class TeacherPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role == User.Role.SUPER_ADMIN:
            return False
        if request.method not in permissions.SAFE_METHODS:
            return request.user.role == User.Role.SCHOOL_ADMIN
        return request.user.role in [User.Role.SCHOOL_ADMIN, User.Role.TEACHER, User.Role.PARENT]

class TeacherViewSet(TenantScopedViewSet):
    permission_classes = [TeacherPermission]
    serializer_class = TeacherSerializer
    queryset = Teacher.objects.select_related('user', 'school').prefetch_related('documents', 'sections__class_room', 'subject_records')

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Teacher.objects.none()
        user = self.request.user
        if not user.is_authenticated:
            return Teacher.objects.none()
        qs = super().get_queryset()
        if user.role == User.Role.TEACHER:
            return qs.filter(user=user)
        if user.role == User.Role.PARENT:
            parent_profile = getattr(user, 'parent_profile', None)
            if parent_profile:
                linked_students = parent_profile.students.filter(school=user.school, status='Active')
                section_ids = [s.section_record_id for s in linked_students if s.section_record_id]
                section_names = [s.section for s in linked_students if s.section]
                class_names = [s.class_name for s in linked_students if s.class_name]
                from django.db.models import Q
                return qs.filter(
                    Q(teaching_assignments__section_id__in=section_ids) |
                    Q(sections__id__in=section_ids) |
                    Q(teaching_assignments__section__name__in=section_names, teaching_assignments__section__class_room__name__in=class_names) |
                    Q(sections__name__in=section_names, sections__class_room__name__in=class_names)
                ).distinct()
            return qs.none()
        if user.role in [User.Role.SCHOOL_ADMIN, User.Role.SUPER_ADMIN]:
            return qs
        return qs.none()

    @staticmethod
    def _normalized_request_data(request):
        import json as json_lib
        if hasattr(request.data, 'dict'):
            data = request.data.dict()
        else:
            data = dict(request.data)

        if 'photo' in request.FILES:
            data['photo'] = request.FILES['photo']

        for list_field in ['subjectIds', 'assignedSections', 'assignedSectionIds', 'teachingAssignments']:
            if list_field not in data:
                continue
            value = data.get(list_field)
            if isinstance(value, str):
                try:
                    data[list_field] = json_lib.loads(value)
                except (json_lib.JSONDecodeError, TypeError):
                    data[list_field] = [v.strip() for v in value.split(',') if v.strip()]
            elif not value:
                data[list_field] = []

        if not data.get('joiningDate'):
            data.pop('joiningDate', None)
        return data

    def create(self, request, *args, **kwargs):
        data = self._normalized_request_data(request)
        serializer = TeacherCreateSerializer(data=data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        school = request.user.school
        if not school:
            # A school tenant is mandatory. We never silently fall back to
            # ``School.objects.first()`` because that would attach a teacher
            # to an unrelated school and break tenant isolation.
            return Response(
                {'detail': 'A school tenant is required to create teacher profiles.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        teacher, credentials = create_teacher_with_login(
            school=school, data=serializer.validated_data, created_by=request.user,
        )
        teacher_serializer = TeacherSerializer(teacher, context={'request': request})
        result = teacher_serializer.data
        result['loginCredentials'] = credentials
        return Response(result, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        teacher = self.get_object()
        serializer = self.get_serializer(
            teacher,
            data=self._normalized_request_data(request),
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(teacher, '_prefetched_objects_cache', None):
            teacher._prefetched_objects_cache = {}
        return Response(self.get_serializer(teacher).data)

    def perform_update(self, serializer):
        teacher = serializer.save()
        user = teacher.user
        active = teacher.status == Teacher.Status.ACTIVE
        if user.is_active != active:
            user.is_active = active
            user.save(update_fields=['is_active'])

    def destroy(self, request, *args, **kwargs):
        """Delete the teacher profile and its login as one atomic operation."""
        teacher = self.get_object()
        with transaction.atomic():
            # The User -> Teacher OneToOne relation cascades to the profile,
            # documents, and exact teaching assignments. Deleting the user is
            # essential: deleting only Teacher leaves an unusable login behind.
            teacher.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        request=TeacherTeachingAssignmentSerializer,
        responses={200: TeacherSerializer},
        description='Add one class-section and subject assignment to an existing teacher.',
    )
    @action(detail=True, methods=['post'], url_path='teaching-assignments')
    def add_teaching_assignment(self, request, pk=None):
        """Assign an existing tenant teacher to one section/subject pair.

        The operation is additive and idempotent so timetable setup cannot
        accidentally replace the teacher's other classes or subjects.
        """
        teacher = self.get_object()
        serializer = TeacherTeachingAssignmentSerializer(
            data=request.data, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        section = serializer.validated_data['section']
        subject = serializer.validated_data['subject']

        with transaction.atomic():
            teacher = Teacher.objects.select_for_update().get(pk=teacher.pk)
            if TeacherTeachingAssignment.objects.filter(
                school_id=request.user.school_id, section=section, subject=subject,
            ).exclude(teacher=teacher).exists():
                return Response(
                    {'detail': 'This class section and subject are already assigned to another teacher.'},
                    status=status.HTTP_409_CONFLICT,
                )
            TeacherTeachingAssignment.objects.get_or_create(
                school_id=request.user.school_id,
                teacher=teacher,
                section=section,
                subject=subject,
                defaults={'created_by': request.user},
            )
            teacher.sections.add(section)
            teacher.subject_records.add(subject)
            teacher.assigned_sections = sorted({
                *(teacher.assigned_sections or []),
                f'{section.class_room.name}-{section.name}',
            })
            teacher.subjects = sorted({*(teacher.subjects or []), subject.name})
            teacher.save(update_fields=['assigned_sections', 'subjects', 'updated_at'])

        teacher = self.get_queryset().get(pk=teacher.pk)
        return Response(self.get_serializer(teacher).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='photo')
    def photo(self, request, pk=None):
        teacher = self.get_object()
        if not teacher.photo_data:
            raise Http404
        response = HttpResponse(bytes(teacher.photo_data), content_type=teacher.photo_content_type or 'image/webp')
        response['Cache-Control'] = 'private, max-age=300'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class TeacherDocumentDownloadView(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={
        200: OpenApiResponse(response=OpenApiTypes.BINARY, description='Authorized teacher document download'),
        403: OpenApiResponse(description='Forbidden'),
        404: OpenApiResponse(description='Not found'),
    })
    def retrieve(self, request, teacher_id=None, doc_id=None):
        document = TeacherDocument.objects.select_related('teacher__user').filter(pk=doc_id, teacher_id=teacher_id).first()
        if not document:
            raise Http404
        teacher, user = document.teacher, request.user
        if user.role == User.Role.SUPER_ADMIN:
            return Response({'detail': 'Super Admins cannot access teacher documents.'}, status=status.HTTP_403_FORBIDDEN)
        if user.school_id != teacher.school_id:
            raise Http404
        allowed = user.role == User.Role.SCHOOL_ADMIN or (
            user.role == User.Role.TEACHER and teacher.user_id == user.id
        )
        if not allowed:
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
    def destroy(self, request, teacher_id=None, doc_id=None):
        if request.user.role != User.Role.SCHOOL_ADMIN:
            return Response({'detail': 'Only school administrators can delete teacher documents.'}, status=status.HTTP_403_FORBIDDEN)
        document = TeacherDocument.objects.filter(pk=doc_id, teacher_id=teacher_id, teacher__school_id=request.user.school_id).first()
        if not document:
            raise Http404
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeacherDocumentCollectionView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'credential_management'

    @extend_schema(request=TeacherDocumentUploadSerializer, responses={
        201: TeacherDocumentSerializer,
        403: OpenApiResponse(description='Forbidden'),
        404: OpenApiResponse(description='Not found'),
    })
    def post(self, request, teacher_id=None):
        if request.user.role != User.Role.SCHOOL_ADMIN:
            return Response({'detail': 'Only school administrators can upload teacher documents.'}, status=status.HTTP_403_FORBIDDEN)
        teacher = Teacher.objects.filter(pk=teacher_id, school_id=request.user.school_id).first()
        if not teacher:
            raise Http404
        serializer = TeacherDocumentUploadSerializer(data=request.data, context={'teacher': teacher})
        serializer.is_valid(raise_exception=True)
        document = serializer.save()
        return Response(TeacherDocumentSerializer(document, context={'request': request}).data, status=status.HTTP_201_CREATED)
