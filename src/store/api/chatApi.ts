import { baseApi } from './baseApi';

export interface ChatChildMapping {
  studentId: number | string;
  studentName: string;
  className: string;
  sectionName: string;
  subjects: string[];
}

export interface ChatStudentInfo {
  id: number | string;
  name: string;
  className: string;
  section: string;
  rollNo: number;
  admissionNo: string;
}

export interface ChatContact {
  id: string | number;
  userId?: number;
  name: string;
  role: 'School Admin' | 'Teacher' | 'Parent' | 'Student' | string;
  email?: string;
  phone?: string;
  isOnline?: boolean;
  isOfficeDesk?: boolean;
  assignedSections?: string[];
  subjects?: string[];
  teachingAssignments?: Array<{
    classId?: number;
    className?: string;
    sectionId?: number;
    sectionName?: string;
    subjectId?: number;
    subjectName?: string;
  }>;
  childMappings?: ChatChildMapping[];
  students?: ChatStudentInfo[];
  studentSummary?: string;
  studentNames?: string[];
}

export interface ApiDirectMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  recipientId: number;
  recipientName: string;
  isMe: boolean;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ApiConversation {
  id: number;
  otherParticipant: {
    id: number;
    name: string;
    role: string;
    email: string;
    isOnline: boolean;
    assignedSections?: string[];
    subjects?: string[];
    childMappings?: ChatChildMapping[];
    students?: ChatStudentInfo[];
    studentSummary?: string;
  };
  lastMessage?: {
    id: number;
    body: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export const chatApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getChatContacts: build.query<ChatContact[], void>({
      query: () => ({ url: '/chat/contacts/' }),
      providesTags: ['Chat'],
    }),
    getConversations: build.query<ApiConversation[], void>({
      query: () => ({ url: '/chat/conversations/' }),
      providesTags: ['Chat'],
    }),
    getMessages: build.query<ApiDirectMessage[], number>({
      query: (conversationId) => ({ url: `/chat/conversations/${conversationId}/messages/` }),
      providesTags: (_res, _err, id) => [{ type: 'Chat' as const, id: `messages-${id}` }],
    }),
    startConversation: build.mutation<ApiConversation, { targetUserId?: number; teacherId?: number; studentId?: number }>({
      query: (body) => ({
        url: '/chat/conversations/start/',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Chat'],
    }),
    sendMessage: build.mutation<ApiDirectMessage, { conversationId: number; message: string }>({
      query: ({ conversationId, message }) => ({
        url: `/chat/conversations/${conversationId}/messages/`,
        method: 'POST',
        body: { message },
      }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'Chat', id: `messages-${arg.conversationId}` },
        'Chat',
      ],
    }),
    clearAllChats: build.mutation<void, void>({
      query: () => ({
        url: '/chat/clear-all/',
        method: 'DELETE',
      }),
      invalidatesTags: ['Chat'],
    }),
  }),
});

export const {
  useGetChatContactsQuery,
  useGetConversationsQuery,
  useGetMessagesQuery,
  useStartConversationMutation,
  useSendMessageMutation,
  useClearAllChatsMutation,
} = chatApi;
