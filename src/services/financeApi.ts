import { apiRequest } from './api';

export interface BackendFeeQuarter {
  id: number;
  fee_structure_id: number;
  target_class?: string;
  academic_year: string;
  quarter_number: number;
  quarter_code: string;
  quarter_name: string;
  assigned_amount: number | string;
  paid_amount: number | string;
  remaining_amount: number | string;
  payment_status: string;
  due_date?: string;
}

export interface BackendFeeStructure {
  id?: number;
  name: string;
  academic_year: string;
  academic_year_id?: number;
  level: string;
  target_class?: string;
  target_class_id?: number;
  target_section?: string;
  target_section_id?: number;
  target_student_id?: string;
  items: any[];
  quarters: any[];
  quarter_records?: BackendFeeQuarter[];
}

export interface BackendStudentFeeRecord {
  id?: number;
  student_id_str: string;
  student_name: string;
  admission_no: string;
  class_name: string;
  section_name: string;
  academic_year: string;
  scholarship?: number;
  discount?: number;
  transport_charges?: number;
  hostel_charges?: number;
  fine_amount?: number;
  installments_paid?: number;
  custom_items?: any[];
  custom_quarters?: any[];
  payment_history: any[];
}

const extractArray = <T>(res: any): T[] => {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.results)) return res.results;
  return [];
};

export const fetchFeeStructuresFromDB = async (
  targetClass?: string,
  academicYear?: string,
  targetClassId?: number,
  targetSectionId?: number
) => {
  try {
    const params = new URLSearchParams();
    if (targetClassId) params.append('target_class_id', String(targetClassId));
    else if (targetClass && targetClass !== 'All') params.append('target_class', targetClass);
    if (targetSectionId) params.append('target_section_id', String(targetSectionId));
    if (academicYear) params.append('academic_year', academicYear);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<BackendFeeStructure[] | { results: BackendFeeStructure[] }>(`/fee-structures/${query}`);
    return extractArray<BackendFeeStructure>(res);
  } catch (err) {
    console.warn('Backend fee-structures fetch fallback to local cache:', err);
    return [];
  }
};

export const resolveFeeStructureFromDB = async (params: {
  studentId?: string | number;
  classId?: number;
  sectionId?: number;
  academicYear?: string;
  academicYearId?: number;
}) => {
  try {
    const urlParams = new URLSearchParams();
    if (params.studentId) urlParams.append('student_id', String(params.studentId));
    if (params.classId) urlParams.append('class_id', String(params.classId));
    if (params.sectionId) urlParams.append('section_id', String(params.sectionId));
    if (params.academicYear) urlParams.append('academic_year', params.academicYear);
    if (params.academicYearId) urlParams.append('academic_year_id', String(params.academicYearId));
    const query = urlParams.toString() ? `?${urlParams.toString()}` : '';
    const res = await apiRequest<BackendFeeStructure | { detail: string; fee_structure: null }>(`/fee-structures/resolve/${query}`);
    if (res && 'id' in res && res.id) {
      return res as BackendFeeStructure;
    }
    return null;
  } catch (err) {
    console.warn('Backend fee structure resolve error:', err);
    return null;
  }
};

export const fetchFeeStructuresByTeacherFromDB = async (teacherId?: string | number) => {
  try {
    const query = teacherId ? `?teacher_id=${teacherId}` : '';
    const res = await apiRequest<BackendFeeStructure[] | { results: BackendFeeStructure[] }>(`/fee-structures/by-teacher/${query}`);
    return extractArray<BackendFeeStructure>(res);
  } catch (err) {
    console.warn('Backend teacher fee structures fetch error:', err);
    return [];
  }
};

export const fetchFeeQuartersFromDB = async (targetClass?: string, academicYear?: string) => {
  try {
    const params = new URLSearchParams();
    if (targetClass && targetClass !== 'All') params.append('target_class', targetClass);
    if (academicYear) params.append('academic_year', academicYear);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<BackendFeeQuarter[] | { results: BackendFeeQuarter[] }>(`/fee-quarters/${query}`);
    return extractArray<BackendFeeQuarter>(res);
  } catch (err) {
    console.warn('Backend fee-quarters fetch error:', err);
    return [];
  }
};

export const createFeeStructureInDB = async (data: Partial<BackendFeeStructure>) => {
  try {
    return await apiRequest<BackendFeeStructure>('/fee-structures/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.warn('Backend fee structure save error:', err);
    return null;
  }
};

export const updateFeeStructureInDB = async (id: number | string, data: Partial<BackendFeeStructure>) => {
  try {
    return await apiRequest<BackendFeeStructure>(`/fee-structures/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.warn('Backend fee structure update error:', err);
    return null;
  }
};

export const deleteFeeStructureFromDB = async (id: number | string) => {
  try {
    return await apiRequest(`/fee-structures/${id}/`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Backend fee structure delete error:', err);
    return null;
  }
};

export const fetchStudentFeeRecordsFromDB = async (className?: string, studentId?: string) => {
  try {
    const params = new URLSearchParams();
    if (className && className !== 'All') params.append('class_name', className);
    if (studentId) params.append('student_id', studentId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<BackendStudentFeeRecord[] | { results: BackendStudentFeeRecord[] }>(`/fee-records/${query}`);
    return extractArray<BackendStudentFeeRecord>(res);
  } catch (err) {
    console.warn('Backend fee-records fetch fallback to local cache:', err);
    return [];
  }
};

export interface BackendQuarterSummary {
  quarterId?: number;
  quarter: string;
  name: string;
  requiredAmount: number;
  amountPaid: number;
  remainingAmount: number;
  dueDate: string;
  status: 'PAID' | 'PARTIALLY_PAID' | 'PAYMENT_DUE' | 'OVERDUE';
}

export interface StudentFeeSummaryResponse {
  studentId: number;
  studentName: string;
  admissionNo: string;
  class: string;
  classId?: number;
  section: string;
  sectionId?: number;
  academicYear: string;
  hasStructure: boolean;
  feeStructureId?: number | null;
  feeStructureName?: string | null;
  totalFees: number;
  totalPaid: number;
  balanceDue: number;
  quartersPaid: number;
  totalQuarters: number;
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'UNCONFIGURED';
  quarters: BackendQuarterSummary[];
  payments: any[];
  breakdown: any[];
  scholarship?: number;
  discount?: number;
  transportCharges?: number;
  hostelCharges?: number;
  fineAmount?: number;
}

export const fetchStudentFeeSummaryFromDB = async (
  studentId: number | string,
  academicYear?: string
): Promise<StudentFeeSummaryResponse | null> => {
  try {
    const params = new URLSearchParams();
    params.append('student_id', String(studentId));
    if (academicYear) params.append('academic_year', academicYear);
    const res = await apiRequest<StudentFeeSummaryResponse>(`/fee-structures/student-summary/?${params.toString()}`);
    return res;
  } catch (err) {
    console.warn('Backend student fee summary fetch error:', err);
    return null;
  }
};

export const fetchStudentFeeSummariesFromDB = async (params: {
  classId?: number;
  sectionId?: number;
  academicYear?: string;
}): Promise<StudentFeeSummaryResponse[]> => {
  try {
    const urlParams = new URLSearchParams();
    if (params.classId) urlParams.append('class_id', String(params.classId));
    if (params.sectionId) urlParams.append('section_id', String(params.sectionId));
    if (params.academicYear) urlParams.append('academic_year', params.academicYear);
    const query = urlParams.toString() ? `?${urlParams.toString()}` : '';
    const res = await apiRequest<StudentFeeSummaryResponse[] | { results: StudentFeeSummaryResponse[] }>(`/fee-structures/student-summaries/${query}`);
    return extractArray<StudentFeeSummaryResponse>(res);
  } catch (err) {
    console.warn('Backend student fee summaries fetch error:', err);
    return [];
  }
};

export const recordStudentPaymentInDB = async (paymentData: {
  studentId: number | string;
  amountPaid: number;
  paymentMethod: string;
  category?: string;
  installmentType?: string;
  quarterId?: number;
}): Promise<{ message: string; payment: any; summary: StudentFeeSummaryResponse } | null> => {
  try {
    return await apiRequest('/fee-structures/record-student-payment/', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  } catch (err) {
    console.warn('Backend record student payment error:', err);
    return null;
  }
};

export const recordFeePaymentInDB = async (
  recordId: number,
  paymentData: { amount_paid: number; payment_method: string; category?: string; installment_type?: string; quarter_id?: number }
) => {
  try {
    return await apiRequest(`/fee-records/${recordId}/record-payment/`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  } catch (err) {
    console.warn('Backend payment record error:', err);
    return null;
  }
};
