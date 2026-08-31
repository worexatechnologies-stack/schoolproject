from itertools import islice

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models.deletion import ProtectedError, RestrictedError
from rest_framework import permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.common.tenancy import TenantScopedViewSet

from .models import AcademicYear, Class, Section, Subject
from .serializers import AcademicYearSerializer, ClassSerializer, SectionSerializer, SubjectSerializer


def _delete_reference(code, label, count, *, examples=(), policy='blocked', message=''):
    """Build a stable, UI-friendly description of a delete dependency."""
    try:
        limited_examples = examples[:5]
    except TypeError:
        limited_examples = islice(examples, 5)
    return {
        'code': code,
        'label': label,
        'count': count,
        'examples': [str(value) for value in limited_examples],
        'deletionPolicy': policy,
        'message': message,
    }


class AcademicAdminWritePermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return request.user.role in [
                User.Role.SCHOOL_ADMIN, User.Role.TEACHER,
                User.Role.PARENT, User.Role.STUDENT,
            ]
        return request.user.role == User.Role.SCHOOL_ADMIN


def _active_teacher_profile(user):
    """Return a canonical active teacher owned by the user's tenant."""
    from apps.staff.models import Teacher

    return Teacher.objects.filter(
        user=user,
        school_id=user.school_id,
        status=Teacher.Status.ACTIVE,
    ).first()


def _refresh_teacher_section_labels(teacher_ids, replaced_labels=()):
    """Keep the temporary JSON labels aligned with canonical section links."""
    from apps.staff.models import Teacher

    teachers = list(
        Teacher.objects.filter(pk__in=set(teacher_ids))
        .prefetch_related('sections__class_room')
    )
    replaced = {str(label).casefold() for label in replaced_labels}
    changed = []
    for teacher in teachers:
        canonical_labels = sorted(
            f'{section.class_room.name}-{section.name}'
            for section in teacher.sections.all()
        )
        canonical_keys = {label.casefold() for label in canonical_labels}
        preserved = [
            str(label) for label in (teacher.assigned_sections or [])
            if str(label).casefold() not in replaced
            and str(label).casefold() not in canonical_keys
        ]
        labels = canonical_labels + preserved
        if teacher.assigned_sections != labels:
            teacher.assigned_sections = labels
            changed.append(teacher)
    if changed:
        Teacher.objects.bulk_update(changed, ['assigned_sections'], batch_size=500)


def _refresh_teacher_subject_labels(teacher_ids, replaced_labels=()):
    """Keep the temporary subject JSON aligned with canonical subject links."""
    from apps.staff.models import Teacher

    teachers = list(
        Teacher.objects.filter(pk__in=set(teacher_ids)).prefetch_related('subject_records')
    )
    replaced = {str(label).casefold() for label in replaced_labels}
    changed = []
    for teacher in teachers:
        canonical_labels = sorted(subject.name for subject in teacher.subject_records.all())
        canonical_keys = {label.casefold() for label in canonical_labels}
        preserved = [
            str(label) for label in (teacher.subjects or [])
            if str(label).casefold() not in replaced
            and str(label).casefold() not in canonical_keys
        ]
        labels = canonical_labels + preserved
        if teacher.subjects != labels:
            teacher.subjects = labels
            changed.append(teacher)
    if changed:
        Teacher.objects.bulk_update(changed, ['subjects'], batch_size=500)


class AcademicMasterViewSet(TenantScopedViewSet):
    """Tenant-safe CRUD with deterministic conflicts instead of database 500s."""

    permission_classes = [AcademicAdminWritePermission]
    integrity_error_message = 'This academic record conflicts with an existing record.'

    def mutation_snapshot(self, instance):
        return {}

    def before_create(self, serializer):
        pass

    def before_update(self, serializer):
        pass

    def after_create(self, instance):
        pass

    def after_update(self, instance, previous):
        pass

    def get_delete_references(self, instance):
        return []

    def get_delete_resource(self, instance):
        return {
            'type': instance._meta.model_name,
            'id': instance.pk,
            'name': getattr(instance, 'name', str(instance)),
        }

    def delete_conflict_response(
        self, instance, references, *, can_cascade=False,
        cascade_param=None, detail=None, cascade_summary=None,
    ):
        resource = self.get_delete_resource(instance)
        if detail is None:
            detail = (
                f'{resource["type"].replace("_", " ").title()} '
                f'"{resource["name"]}" is in use and cannot be deleted.'
            )
        return Response(
            {
                'code': 'record_in_use',
                'detail': detail,
                'resource': resource,
                'references': references,
                'canCascade': can_cascade,
                'cascadeParam': cascade_param,
                'cascadeSummary': cascade_summary,
            },
            status=status.HTTP_409_CONFLICT,
        )

    def database_delete_conflict_response(self, instance, exc):
        protected = getattr(exc, 'protected_objects', None)
        if protected is None:
            protected = getattr(exc, 'restricted_objects', None)
        count = len(protected) if protected is not None else 1
        return self.delete_conflict_response(
            instance,
            [_delete_reference(
                'database_references', 'Other records', count,
                message='One or more database records still reference this item.',
            )],
            detail='This record is still referenced by other data and cannot be deleted.',
        )

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                self.before_create(serializer)
                instance = serializer.save(school=self.request.user.school)
                self.after_create(instance)
        except IntegrityError as exc:
            raise serializers.ValidationError({'detail': self.integrity_error_message}) from exc

    def perform_update(self, serializer):
        previous = self.mutation_snapshot(serializer.instance)
        try:
            with transaction.atomic():
                self.before_update(serializer)
                instance = serializer.save(school=serializer.instance.school)
                self.after_update(instance, previous)
        except IntegrityError as exc:
            raise serializers.ValidationError({'detail': self.integrity_error_message}) from exc

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        references = self.get_delete_references(instance)
        if references:
            return self.delete_conflict_response(instance, references)
        try:
            with transaction.atomic():
                self.perform_destroy(instance)
        except (ProtectedError, RestrictedError, IntegrityError) as exc:
            return self.database_delete_conflict_response(instance, exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcademicYearViewSet(AcademicMasterViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer
    integrity_error_message = 'An academic year with this name already exists.'

    def mutation_snapshot(self, instance):
        return {'name': instance.name}

    def _make_only_active_year(self, instance):
        if instance.is_active:
            AcademicYear.objects.filter(
                school_id=instance.school_id, is_active=True,
            ).exclude(pk=instance.pk).update(is_active=False)

    def before_create(self, serializer):
        if AcademicYear.objects.filter(school_id=self.request.user.school_id).exists():
            raise serializers.ValidationError(
                {'detail': 'Only one academic batch/year is permitted per school. You can edit the existing batch when the year changes.'}
            )
        if serializer.validated_data.get('is_active', False):
            AcademicYear.objects.filter(
                school_id=self.request.user.school_id, is_active=True,
            ).update(is_active=False)

    def before_update(self, serializer):
        will_be_active = serializer.validated_data.get(
            'is_active', serializer.instance.is_active,
        )
        if will_be_active:
            AcademicYear.objects.filter(
                school_id=serializer.instance.school_id, is_active=True,
            ).exclude(pk=serializer.instance.pk).update(is_active=False)

    def after_create(self, instance):
        self._make_only_active_year(instance)

    def after_update(self, instance, previous):
        from apps.sis.models import AcademicHistory, Student

        old_name = previous['name']
        if old_name != instance.name:
            Student.objects.filter(
                school_id=instance.school_id, academic_year__iexact=old_name,
            ).update(academic_year=instance.name)
            AcademicHistory.objects.filter(
                student__school_id=instance.school_id, academic_year__iexact=old_name,
            ).update(academic_year=instance.name)
        self._make_only_active_year(instance)

    def get_delete_references(self, instance):
        from apps.sis.models import AcademicHistory, Student

        references = []
        students = Student.objects.filter(
            school_id=instance.school_id, academic_year__iexact=instance.name,
        )
        student_count = students.count()
        if student_count:
            references.append(_delete_reference(
                'students', 'Students', student_count,
                examples=[
                    f'{admission_no} · {name}'
                    for admission_no, name in students.order_by('admission_no').values_list('admission_no', 'name')
                ],
                message='Students currently use this academic year.',
            ))
        history = AcademicHistory.objects.filter(
            student__school_id=instance.school_id, academic_year__iexact=instance.name,
        )
        history_count = history.count()
        if history_count:
            references.append(_delete_reference(
                'student_academic_history', 'Student academic history', history_count,
                message='Historical student records use this academic year.',
            ))
        return references


class ClassViewSet(AcademicMasterViewSet):
    queryset = Class.objects.prefetch_related('subjects')
    serializer_class = ClassSerializer
    integrity_error_message = 'A class with this name or code already exists.'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.SCHOOL_ADMIN:
            return qs
        if user.role == User.Role.TEACHER:
            profile = _active_teacher_profile(user)
            return qs.filter(
                Q(sections__teachers=profile, sections__school_id=user.school_id) |
                Q(sections__teacher_assignments__teacher=profile, sections__teacher_assignments__school_id=user.school_id)
            ).distinct() if profile else qs.none()
        if user.role == User.Role.STUDENT:
            profile = getattr(user, 'student_profile', None)
            section_id = getattr(getattr(profile, 'student', None), 'section_record_id', None)
            return qs.filter(sections__id=section_id) if section_id else qs.none()
        if user.role == User.Role.PARENT:
            profile = getattr(user, 'parent_profile', None)
            return qs.filter(sections__students__parent_profiles=profile).distinct() if profile else qs.none()
        return qs.none()

    def mutation_snapshot(self, instance):
        return {'name': instance.name}

    def after_update(self, instance, previous):
        from apps.exams.models import Exam
        from apps.sis.models import Student
        from apps.staff.models import Teacher

        old_name = previous['name']
        if old_name == instance.name:
            return

        Student.objects.filter(
            school_id=instance.school_id, section_record__class_room_id=instance.pk,
        ).update(class_name=instance.name)
        Student.objects.filter(
            school_id=instance.school_id, section_record__isnull=True,
            class_name__iexact=old_name,
        ).update(class_name=instance.name)
        Exam.objects.filter(
            school_id=instance.school_id, class_name__iexact=old_name,
        ).update(class_name=instance.name)
        teacher_ids = Teacher.objects.filter(
            school_id=instance.school_id, sections__class_room_id=instance.pk,
        ).values_list('pk', flat=True)
        old_labels = [
            f'{old_name}-{section_name}'
            for section_name in instance.sections.values_list('name', flat=True)
        ]
        _refresh_teacher_section_labels(teacher_ids, old_labels)

    def get_delete_references(self, instance):
        from apps.exams.models import Exam
        from apps.sis.models import Student
        from apps.staff.models import Teacher

        references = []
        sections = instance.sections.order_by('name')
        section_count = sections.count()
        if section_count:
            references.append(_delete_reference(
                'sections', 'Sections', section_count,
                examples=sections.values_list('name', flat=True), policy='cascade',
                message='These sections belong to the class and can be removed with it.',
            ))

        students = Student.objects.filter(
            school_id=instance.school_id,
            section_record__class_room_id=instance.pk,
        )
        student_count = students.count()
        if student_count:
            references.append(_delete_reference(
                'students', 'Students', student_count,
                examples=[
                    f'{admission_no} · {name} ({academic_year})'
                    for admission_no, name, academic_year in students.order_by('admission_no').values_list('admission_no', 'name', 'academic_year')
                ],
                message='Reassign these students to another section before deleting the class.',
            ))

        legacy_students = Student.objects.filter(
            school_id=instance.school_id, section_record__isnull=True,
            class_name__iexact=instance.name,
        )
        legacy_student_count = legacy_students.count()
        if legacy_student_count:
            references.append(_delete_reference(
                'legacy_student_assignments', 'Unlinked student assignments',
                legacy_student_count,
                examples=[
                    f'{admission_no} · {name} ({academic_year})'
                    for admission_no, name, academic_year in legacy_students.order_by('admission_no').values_list('admission_no', 'name', 'academic_year')
                ],
                message='Link or reassign these legacy student records before deleting the class.',
            ))

        exams = Exam.objects.filter(
            school_id=instance.school_id, class_name__iexact=instance.name,
        )
        exam_count = exams.count()
        if exam_count:
            references.append(_delete_reference(
                'exams', 'Exams', exam_count,
                examples=exams.order_by('date', 'name').values_list('name', flat=True),
                message='Delete or move these exams before deleting the class.',
            ))

        teacher_ids, section_labels = self._assigned_teacher_ids(instance)
        if teacher_ids:
            teachers = Teacher.objects.filter(pk__in=teacher_ids).select_related('user').order_by('user__email')
            teacher_examples = [
                teacher.user.get_full_name() or teacher.user.email
                for teacher in teachers[:5]
            ]
            references.append(_delete_reference(
                'teacher_assignments', 'Teacher assignments', len(teacher_ids),
                examples=teacher_examples, policy='detach',
                message='Teacher accounts are preserved; only assignments to these sections are removed.',
            ))

        subject_count = instance.subjects.count()
        if subject_count:
            references.append(_delete_reference(
                'subject_assignments', 'Subject assignments', subject_count,
                examples=instance.subjects.order_by('name').values_list('name', flat=True),
                policy='detach',
                message='Subjects are preserved; only their assignment to this class is removed.',
            ))
        return references

    def _assigned_teacher_ids(self, instance):
        """Return canonical and legacy teacher assignments for this class."""
        from apps.staff.models import Teacher

        section_labels = {
            f'{instance.name}-{name}'.casefold()
            for name in instance.sections.values_list('name', flat=True)
        }
        teacher_ids = set(
            Teacher.objects.filter(
                school_id=instance.school_id, sections__class_room_id=instance.pk,
            ).values_list('pk', flat=True)
        )
        if section_labels:
            for teacher_id, labels in Teacher.objects.filter(
                school_id=instance.school_id,
            ).values_list('pk', 'assigned_sections').iterator(chunk_size=500):
                if any(str(label).casefold() in section_labels for label in (labels or [])):
                    teacher_ids.add(teacher_id)
        return teacher_ids, section_labels

    def _class_delete_conflict(self, instance, references):
        hard_blockers = [
            reference for reference in references
            if reference['deletionPolicy'] == 'blocked'
        ]
        can_cascade = not hard_blockers and any(
            reference['deletionPolicy'] == 'cascade' for reference in references
        )
        if hard_blockers:
            blocker_summary = ', '.join(
                f'{reference["count"]} {reference["label"].lower()}'
                for reference in hard_blockers
            )
            detail = (
                f'Class "{instance.name}" cannot be deleted because it has '
                f'{blocker_summary}. Reassign or remove those records first.'
            )
            cascade_summary = None
        else:
            section_count = next(
                (reference['count'] for reference in references if reference['code'] == 'sections'),
                0,
            )
            detail = (
                f'Class "{instance.name}" contains {section_count} section(s). '
                'Confirm deletion to remove the class and its empty sections.'
            )
            cascade_summary = (
                'The class and its empty sections will be deleted. Teacher and subject '
                'records are preserved; only their assignments to this class are removed.'
            )
        return self.delete_conflict_response(
            instance, references, can_cascade=can_cascade,
            cascade_param='sections' if can_cascade else None,
            detail=detail, cascade_summary=cascade_summary,
        )

    def destroy(self, request, *args, **kwargs):
        """Delete a class, optionally cascading only through safe section links.

        ``?cascade=sections`` is deliberately narrow: it can remove empty sections
        and assignment join rows, but it never deletes students, teachers, subjects,
        or exams. Data-bearing dependencies continue to return HTTP 409.
        """
        requested_cascade = request.query_params.get('cascade')
        if requested_cascade not in (None, '', 'sections'):
            return Response(
                {
                    'code': 'invalid_cascade',
                    'detail': 'Unsupported cascade option. Use cascade=sections.',
                    'allowedValues': ['sections'],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance = self.get_object()
        try:
            with transaction.atomic():
                # Re-read under a row lock so the dependency decision and the
                # delete are one operation rather than a stale preflight check.
                instance = self.get_queryset().select_for_update().get(pk=instance.pk)
                references = self.get_delete_references(instance)
                relevant_references = [
                    reference for reference in references
                    if reference['deletionPolicy'] in ('blocked', 'cascade')
                ]
                hard_blockers = [
                    reference for reference in references
                    if reference['deletionPolicy'] == 'blocked'
                ]
                if requested_cascade != 'sections' and relevant_references:
                    return self._class_delete_conflict(instance, references)
                if requested_cascade == 'sections' and hard_blockers:
                    return self._class_delete_conflict(instance, references)

                teacher_ids, section_labels = self._assigned_teacher_ids(instance)
                self.perform_destroy(instance)
                if teacher_ids:
                    _refresh_teacher_section_labels(teacher_ids, section_labels)
        except (ProtectedError, RestrictedError, IntegrityError) as exc:
            return self.database_delete_conflict_response(instance, exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SectionViewSet(AcademicMasterViewSet):
    queryset = Section.objects.select_related('class_room')
    serializer_class = SectionSerializer
    integrity_error_message = 'This section already exists in the selected class.'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.SCHOOL_ADMIN:
            return qs
        if user.role == User.Role.TEACHER:
            profile = _active_teacher_profile(user)
            return qs.filter(
                Q(teachers=profile, school_id=user.school_id) |
                Q(teacher_assignments__teacher=profile, teacher_assignments__school_id=user.school_id)
            ).distinct() if profile else qs.none()
        if user.role == User.Role.STUDENT:
            profile = getattr(user, 'student_profile', None)
            section_id = getattr(getattr(profile, 'student', None), 'section_record_id', None)
            return qs.filter(pk=section_id) if section_id else qs.none()
        if user.role == User.Role.PARENT:
            profile = getattr(user, 'parent_profile', None)
            return qs.filter(students__parent_profiles=profile).distinct() if profile else qs.none()
        return qs.none()

    def mutation_snapshot(self, instance):
        return {
            'name': instance.name,
            'class_name': instance.class_room.name,
        }

    def after_update(self, instance, previous):
        from apps.exams.models import Exam
        from apps.sis.models import Student
        from apps.staff.models import Teacher

        new_class_name = instance.class_room.name
        old_name = previous['name']
        old_class_name = previous['class_name']
        if old_name == instance.name and old_class_name == new_class_name:
            return

        Student.objects.filter(
            school_id=instance.school_id, section_record_id=instance.pk,
        ).update(class_name=new_class_name, section=instance.name)
        Student.objects.filter(
            school_id=instance.school_id, section_record__isnull=True,
            class_name__iexact=old_class_name, section__iexact=old_name,
        ).update(class_name=new_class_name, section=instance.name)
        Exam.objects.filter(
            school_id=instance.school_id, class_name__iexact=old_class_name,
            section__iexact=old_name,
        ).update(class_name=new_class_name, section=instance.name)
        teacher_ids = Teacher.objects.filter(
            school_id=instance.school_id, sections=instance,
        ).values_list('pk', flat=True)
        _refresh_teacher_section_labels(
            teacher_ids, [f'{old_class_name}-{old_name}'],
        )

    def get_delete_references(self, instance):
        from apps.exams.models import Exam
        from apps.sis.models import Student
        from apps.staff.models import Teacher

        references = []
        students = instance.students.order_by('admission_no')
        student_count = students.count()
        if student_count:
            references.append(_delete_reference(
                'students', 'Students', student_count,
                examples=[
                    f'{admission_no} · {name} ({academic_year})'
                    for admission_no, name, academic_year in students.values_list('admission_no', 'name', 'academic_year')
                ],
                message='Reassign these students before deleting the section.',
            ))
        teachers = instance.teachers.select_related('user').order_by('user__email')
        teacher_count = teachers.count()
        if teacher_count:
            references.append(_delete_reference(
                'teachers', 'Teachers', teacher_count,
                examples=[teacher.user.get_full_name() or teacher.user.email for teacher in teachers[:5]],
                message='Remove this section from these teachers before deleting it.',
            ))
        canonical_teacher_ids = set(teachers.values_list('pk', flat=True))
        section_label = f'{instance.class_room.name}-{instance.name}'.casefold()
        legacy_teacher_ids = {
            teacher_id
            for teacher_id, labels in Teacher.objects.filter(
                school_id=instance.school_id,
            ).values_list('pk', 'assigned_sections').iterator(chunk_size=500)
            if any(str(label).casefold() == section_label for label in (labels or []))
        } - canonical_teacher_ids
        if legacy_teacher_ids:
            references.append(_delete_reference(
                'legacy_teacher_assignments', 'Unlinked teacher assignments',
                len(legacy_teacher_ids),
                message='Remove this legacy section assignment before deleting the section.',
            ))
        legacy_students = Student.objects.filter(
            school_id=instance.school_id, section_record__isnull=True,
            class_name__iexact=instance.class_room.name,
            section__iexact=instance.name,
        )
        legacy_student_count = legacy_students.count()
        if legacy_student_count:
            references.append(_delete_reference(
                'legacy_student_assignments', 'Unlinked student assignments',
                legacy_student_count,
                examples=[
                    f'{admission_no} · {name} ({academic_year})'
                    for admission_no, name, academic_year in legacy_students.order_by('admission_no').values_list('admission_no', 'name', 'academic_year')
                ],
                message='Link or reassign these legacy student records before deleting the section.',
            ))
        exams = Exam.objects.filter(
            school_id=instance.school_id, class_name__iexact=instance.class_room.name,
            section__iexact=instance.name,
        )
        exam_count = exams.count()
        if exam_count:
            references.append(_delete_reference(
                'exams', 'Exams', exam_count,
                examples=exams.order_by('date', 'name').values_list('name', flat=True),
                message='Delete or move these exams before deleting the section.',
            ))
        return references


class SubjectViewSet(AcademicMasterViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    integrity_error_message = 'A subject with this name already exists.'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == User.Role.SCHOOL_ADMIN:
            return qs
        if user.role == User.Role.TEACHER:
            profile = _active_teacher_profile(user)
            return qs.filter(
                Q(teachers=profile, school_id=user.school_id) |
                Q(teacher_assignments__teacher=profile, teacher_assignments__school_id=user.school_id)
            ).distinct() if profile else qs.none()
        if user.role == User.Role.STUDENT:
            profile = getattr(user, 'student_profile', None)
            section_id = getattr(getattr(profile, 'student', None), 'section_record_id', None)
            return qs.filter(classes__sections__id=section_id).distinct() if section_id else qs.none()
        if user.role == User.Role.PARENT:
            profile = getattr(user, 'parent_profile', None)
            return qs.filter(classes__sections__students__parent_profiles=profile).distinct() if profile else qs.none()
        return qs.none()

    @staticmethod
    def _scope_payload(section):
        return {
            'classId': section.class_room_id,
            'className': section.class_room.name,
            'sectionId': section.id,
            'sectionName': section.name,
        }

    @action(detail=False, methods=['get'], url_path='visible')
    def visible(self, request):
        """Return only the curriculum subjects visible to the signed-in role.

        This endpoint deliberately describes curriculum/teaching assignments,
        not timetable publication.  A class subject becomes visible to a
        student as soon as the School Admin assigns it in Academic Setup.  A
        teacher sees their own subject records, with class/section scopes
        limited to the sections assigned to that same teacher.  Whether a
        subject has a published period is a separate timetable concern.
        """
        user = request.user
        school_id = user.school_id
        subject_scopes = {}
        teacher_id = None

        if user.role == User.Role.SCHOOL_ADMIN:
            subjects = list(
                Subject.objects.filter(school_id=school_id)
                .order_by('name')
            )
            scope_kind = 'school_catalog'
        elif user.role == User.Role.TEACHER:
            profile = _active_teacher_profile(user)
            if not profile:
                subjects = []
            else:
                teacher_id = profile.pk
                assignments = list(
                    profile.teaching_assignments.filter(
                        school_id=school_id,
                        section__school_id=school_id,
                        subject__school_id=school_id,
                    )
                    .select_related('section__class_room', 'subject')
                    .order_by(
                        'subject__name', 'section__class_room__sort_order',
                        'section__class_room__name', 'section__name',
                    )
                )
                subject_by_id = {}
                for assignment in assignments:
                    subject_by_id[assignment.subject_id] = assignment.subject
                    subject_scopes.setdefault(assignment.subject_id, []).append(
                        self._scope_payload(assignment.section)
                    )
                for direct_subject in profile.subject_records.filter(school_id=school_id):
                    subject_by_id.setdefault(direct_subject.pk, direct_subject)
                    subject_scopes.setdefault(direct_subject.pk, [])
                    for sec in profile.sections.filter(school_id=school_id, class_room__subjects=direct_subject).select_related('class_room'):
                        scope = self._scope_payload(sec)
                        if scope not in subject_scopes[direct_subject.pk]:
                            subject_scopes[direct_subject.pk].append(scope)
                subjects = sorted(
                    subject_by_id.values(), key=lambda item: item.name.casefold(),
                )
            scope_kind = 'teacher_assignment'
        elif user.role == User.Role.STUDENT:
            login_profile = getattr(user, 'student_profile', None)
            student = getattr(login_profile, 'student', None)
            section = getattr(student, 'section_record', None)
            if not section or section.school_id != school_id:
                subjects = []
            else:
                section = (
                    Section.objects.select_related('class_room')
                    .prefetch_related('class_room__subjects')
                    .get(pk=section.pk, school_id=school_id)
                )
                subjects = list(section.class_room.subjects.all().order_by('name'))
                for subject in subjects:
                    subject_scopes[subject.pk] = [self._scope_payload(section)]
            scope_kind = 'student_class'
        elif user.role == User.Role.PARENT:
            parent_profile = getattr(user, 'parent_profile', None)
            sections = []
            if parent_profile:
                section_ids = parent_profile.students.filter(
                    school_id=school_id, section_record__isnull=False,
                ).values_list('section_record_id', flat=True)
                sections = list(
                    Section.objects.filter(pk__in=section_ids, school_id=school_id)
                    .select_related('class_room')
                    .prefetch_related('class_room__subjects')
                    .order_by('class_room__sort_order', 'class_room__name', 'name')
                    .distinct()
                )
            subject_by_id = {}
            for section in sections:
                for subject in section.class_room.subjects.all():
                    subject_by_id[subject.pk] = subject
                    subject_scopes.setdefault(subject.pk, []).append(
                        self._scope_payload(section)
                    )
            subjects = sorted(subject_by_id.values(), key=lambda item: item.name.casefold())
            scope_kind = 'linked_students_classes'
        else:
            subjects = []
            scope_kind = 'none'

        # Teacher scopes come only from exact section-subject assignments.
        # Independent legacy section/subject lists must never be combined as a
        # Cartesian product because that would grant classes the teacher was
        # not actually assigned to teach.
        return Response({
            'role': user.frontend_role,
            'scopeKind': scope_kind,
            'teacherId': teacher_id,
            'subjects': [
                {
                    'id': subject.pk,
                    'name': subject.name,
                    'scopes': subject_scopes.get(subject.pk, []),
                }
                for subject in subjects
            ],
            'semantics': {
                'assigned': 'Subjects configured for the user in PostgreSQL.',
                'scheduled': 'A subject is scheduled only after a timetable period is published.',
            },
        })

    def mutation_snapshot(self, instance):
        return {'name': instance.name}

    def after_update(self, instance, previous):
        from apps.exams.models import Exam
        from apps.staff.models import Teacher

        old_name = previous['name']
        if old_name == instance.name:
            return
        Exam.objects.filter(
            school_id=instance.school_id, subject__iexact=old_name,
        ).update(subject=instance.name)
        teacher_ids = Teacher.objects.filter(
            school_id=instance.school_id, subject_records=instance,
        ).values_list('pk', flat=True)
        _refresh_teacher_subject_labels(teacher_ids, [old_name])

    def get_delete_references(self, instance):
        from apps.exams.models import Exam
        from apps.staff.models import Teacher

        references = []
        classes = instance.classes.order_by('sort_order', 'name')
        class_count = classes.count()
        if class_count:
            references.append(_delete_reference(
                'classes', 'Classes', class_count,
                examples=classes.values_list('name', flat=True),
                message='Remove this subject from these classes before deleting it.',
            ))
        teachers = instance.teachers.select_related('user').order_by('user__email')
        teacher_count = teachers.count()
        if teacher_count:
            references.append(_delete_reference(
                'teachers', 'Teachers', teacher_count,
                examples=[teacher.user.get_full_name() or teacher.user.email for teacher in teachers[:5]],
                message='Remove this subject from these teachers before deleting it.',
            ))
        canonical_teacher_ids = set(teachers.values_list('pk', flat=True))
        exams = Exam.objects.filter(
            school_id=instance.school_id, subject__iexact=instance.name,
        )
        exam_count = exams.count()
        if exam_count:
            references.append(_delete_reference(
                'exams', 'Exams', exam_count,
                examples=exams.order_by('date', 'name').values_list('name', flat=True),
                message='Delete or move these exams before deleting the subject.',
            ))
        legacy_teacher_ids = {
            teacher_id
            for teacher_id, values in Teacher.objects.filter(
                school_id=instance.school_id,
            ).values_list('pk', 'subjects').iterator(chunk_size=500)
            if any(str(value).casefold() == instance.name.casefold() for value in (values or []))
        } - canonical_teacher_ids
        if legacy_teacher_ids:
            references.append(_delete_reference(
                'legacy_teacher_assignments', 'Unlinked teacher assignments',
                len(legacy_teacher_ids),
                message='Remove this legacy subject assignment before deleting the subject.',
            ))
        return references
