from django.conf import settings
from django.db import models


class ChatbotInteraction(models.Model):
    """Access-controlled audit record; deliberately not written to application logs."""
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='chatbot_interactions')
    parent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chatbot_interactions')
    student = models.ForeignKey('sis.Student', on_delete=models.CASCADE, related_name='chatbot_interactions')
    question = models.TextField()
    response = models.TextField()
    token_usage = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['school', '-created_at']), models.Index(fields=['parent', '-created_at'])]


class Conversation(models.Model):
    school = models.ForeignKey('schools.School', on_delete=models.CASCADE, related_name='conversations')
    participant1 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_p1')
    participant2 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_p2')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('participant1', 'participant2')
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['participant1', '-updated_at']),
            models.Index(fields=['participant2', '-updated_at']),
            models.Index(fields=['school', '-updated_at']),
        ]

    @classmethod
    def get_or_create_between(cls, school, user_a, user_b):
        p1, p2 = (user_a, user_b) if user_a.id < user_b.id else (user_b, user_a)
        conv, created = cls.objects.get_or_create(
            participant1=p1,
            participant2=p2,
            defaults={'school': school},
        )
        return conv, created

    def get_other_participant(self, user):
        return self.participant2 if self.participant1_id == user.id else self.participant1


class DirectMessage(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_direct_messages')
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='received_direct_messages')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['recipient', 'read_at']),
        ]
