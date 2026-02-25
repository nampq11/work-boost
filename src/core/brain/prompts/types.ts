/**
 * Prompts Types
 *
 * Shared types for prompts module.
 */

/**
 * Schema type enum for JSON schema definitions
 */
export enum SchemaType {
  ARRAY = 'array',
  OBJECT = 'object',
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
}

/**
 * Base schema property interface
 */
export interface SchemaProperty {
  type: SchemaType;
  description: string;
  nullable?: boolean;
}

/**
 * Object schema property interface
 */
export interface ObjectSchemaProperty extends SchemaProperty {
  type: SchemaType.OBJECT;
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Array schema property interface
 */
export interface ArraySchemaProperty extends SchemaProperty {
  type: SchemaType.ARRAY;
  items: SchemaProperty | ObjectSchemaProperty;
}

/**
 * String schema property with enum support
 */
export interface StringSchemaProperty extends SchemaProperty {
  type: SchemaType.STRING;
  enum?: string[];
}

/**
 * JSON schema definition
 */
export interface JsonSchema {
  description: string;
  type: SchemaType;
  properties?: Record<string, SchemaProperty | ObjectSchemaProperty | ArraySchemaProperty | StringSchemaProperty>;
  items?: SchemaProperty | ObjectSchemaProperty;
  required?: string[];
  enum?: string[];
  nullable?: boolean;
}
