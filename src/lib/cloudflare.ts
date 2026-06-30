export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: Record<string, unknown> }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export interface Queue<T = unknown> {
  send(message: T): Promise<void>;
}

export interface DurableObjectNamespace<T = unknown> {
  idFromName(name: string): unknown;
  idFromString(id: string): unknown;
  get(id: unknown): T;
}

export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledController {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
}

export type QueueMessage<T> = {
  body: T;
  id?: string;
  timestamp?: number;
  attempts?: number;
};

export type MessageBatch<T> = {
  messages: Array<QueueMessage<T>>;
};
