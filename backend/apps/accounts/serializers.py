from rest_framework import serializers
from typing import List, Optional
from .models import User

ROLE_MODULES = {
    'super_admin': ['super-admin-dashboard', 'super-admin-schools', 'super-admin-admins', 'super-admin-sys-settings', 'academic'],
    'school_admin': ['dashboard', 'student', 'academic', 'attendance', 'fees', 'exams', 'promotion', 'communication', 'library', 'transport', 'developer'],
    'teacher': ['dashboard', 'student', 'academic', 'attendance', 'learning', 'exams', 'communication'],
    'parent': ['dashboard', 'academic', 'attendance', 'learning', 'fees', 'exams', 'communication', 'transport'],
    'student': ['dashboard', 'academic', 'learning', 'exams', 'communication', 'transport'],
    'public_learner': ['public-learning'],
}

class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    schoolId = serializers.CharField(source='school_id', read_only=True)
    schoolName = serializers.CharField(source='school.name', read_only=True)
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    mustChangePassword = serializers.BooleanField(source='must_change_password', read_only=True)
    studentId = serializers.SerializerMethodField()
    parentStudentIds = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'schoolId', 'schoolName', 'isActive', 'mustChangePassword', 'studentId', 'parentStudentIds', 'permissions']
    def get_name(self, obj) -> str:
        return obj.get_full_name() or obj.username
    def get_permissions(self, obj) -> List[str]:
        return obj.permissions_override or ROLE_MODULES.get(obj.role, [])
    def get_studentId(self, obj) -> Optional[str]:
        profile = getattr(obj, 'student_profile', None)
        return str(profile.student_id) if profile else None
    def get_parentStudentIds(self, obj) -> List[str]:
        profile = getattr(obj, 'parent_profile', None)
        return [str(student_id) for student_id in profile.students.values_list('id', flat=True)] if profile else []


class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['email', 'username', 'first_name', 'last_name', 'role', 'school']

    def validate_role(self, value):
        if value in [User.Role.STUDENT, User.Role.PARENT]:
            raise serializers.ValidationError('Student and parent users can only be created through POST /api/v1/students/ admission.')
        if value == User.Role.TEACHER:
            raise serializers.ValidationError('Teacher users can only be created through POST /api/v1/teachers/.')
        return value
