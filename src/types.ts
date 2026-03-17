export type FieldType = 'text' | 'multiline' | 'date' | 'select' | 'number';

export interface FormField {
  id: string;
  title: string;
  type: FieldType;
  required: boolean;
  description?: string;
  options?: string[]; // select 타입용
  llm_prompt?: string;
}

export interface FormTemplate {
  name: string;
  type: 'form';
  fields: FormField[];
}

export interface LLMTemplate {
  name: string;
  type: 'llm';
  system_prompt: string;
  question_flow: string[];
  output_template?: string;
}

export type Template = FormTemplate | LLMTemplate;

export interface WriteHelperSettings {
  rootFolder: string;
  openaiApiKey: string;
  openaiModel: string;
  tagPrompt: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ValidationIssue {
  fieldId: string;
  fieldTitle: string;
  type: 'missing' | 'invalid_type';
  message: string;
}

export interface FileValidationResult {
  filePath: string;
  issues: ValidationIssue[];
}
