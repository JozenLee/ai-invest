'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface JsonSchemaProperty {
  type: string;
  title?: string;
  description?: string;
  default?: any;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  enum?: string[];
  items?: {
    type: string;
    enum?: string[];
  };
  properties?: Record<string, JsonSchemaProperty>;
  examples?: any[];
}

interface JsonSchema {
  type: string;
  required?: string[];
  properties: Record<string, JsonSchemaProperty>;
}

interface DynamicConfigFormProps {
  schema: JsonSchema;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  errors?: Record<string, string>;
}

/**
 * 根据 JSON Schema 动态生成表单
 */
export function DynamicConfigForm({
  schema,
  value,
  onChange,
  errors = {},
}: DynamicConfigFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(value || {});

  // 初始化默认值
  useEffect(() => {
    const defaults: Record<string, any> = {};
    Object.entries(schema.properties).forEach(([key, prop]) => {
      if (prop.default !== undefined && formData[key] === undefined) {
        defaults[key] = prop.default;
      }
    });
    if (Object.keys(defaults).length > 0) {
      const newData = { ...formData, ...defaults };
      setFormData(newData);
      onChange(newData);
    }
  }, []);

  const handleChange = (field: string, newValue: any) => {
    const newData = { ...formData, [field]: newValue };
    setFormData(newData);
    onChange(newData);
  };

  const renderField = (field: string, prop: JsonSchemaProperty) => {
    const isRequired = schema.required?.includes(field);
    const fieldError = errors[field];

    // 字符串输入
    if (prop.type === 'string' && !prop.enum) {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>
            {prop.title || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {prop.description && (
            <p className="text-sm text-muted-foreground">{prop.description}</p>
          )}
          <Input
            id={field}
            type="text"
            value={formData[field] || ''}
            onChange={(e) => handleChange(field, e.target.value)}
            placeholder={prop.examples?.[0] || ''}
            className={fieldError ? 'border-red-500' : ''}
          />
          {fieldError && <p className="text-sm text-red-500">{fieldError}</p>}
        </div>
      );
    }

    // 数字输入
    if (prop.type === 'integer') {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>
            {prop.title || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {prop.description && (
            <p className="text-sm text-muted-foreground">{prop.description}</p>
          )}
          <Input
            id={field}
            type="number"
            value={formData[field] ?? ''}
            onChange={(e) => handleChange(field, parseInt(e.target.value) || undefined)}
            min={prop.minimum}
            max={prop.maximum}
            placeholder={prop.examples?.[0]?.toString() || ''}
            className={fieldError ? 'border-red-500' : ''}
          />
          {(prop.minimum !== undefined || prop.maximum !== undefined) && (
            <p className="text-xs text-muted-foreground">
              {prop.minimum !== undefined && `最小: ${prop.minimum}`}
              {prop.minimum !== undefined && prop.maximum !== undefined && ' | '}
              {prop.maximum !== undefined && `最大: ${prop.maximum}`}
            </p>
          )}
          {fieldError && <p className="text-sm text-red-500">{fieldError}</p>}
        </div>
      );
    }

    // 布尔值
    if (prop.type === 'boolean') {
      return (
        <div key={field} className="flex items-center space-x-2">
          <Checkbox
            id={field}
            checked={formData[field] ?? prop.default ?? false}
            onCheckedChange={(checked) => handleChange(field, checked)}
          />
          <Label htmlFor={field} className="cursor-pointer">
            {prop.title || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {prop.description && (
            <p className="text-sm text-muted-foreground ml-2">({prop.description})</p>
          )}
        </div>
      );
    }

    // 数组 - 多选枚举
    if (prop.type === 'array' && prop.items?.enum) {
      const selectedValues = (formData[field] || []) as string[];
      return (
        <div key={field} className="space-y-2">
          <Label>
            {prop.title || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {prop.description && (
            <p className="text-sm text-muted-foreground">{prop.description}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {prop.items.enum.map((option) => (
              <Badge
                key={option}
                variant={selectedValues.includes(option) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => {
                  const newValues = selectedValues.includes(option)
                    ? selectedValues.filter((v) => v !== option)
                    : [...selectedValues, option];
                  handleChange(field, newValues);
                }}
              >
                {option}
              </Badge>
            ))}
          </div>
          {fieldError && <p className="text-sm text-red-500">{fieldError}</p>}
        </div>
      );
    }

    // 数组 - 字符串列表
    if (prop.type === 'array' && prop.items?.type === 'string' && !prop.items.enum) {
      const arrayValues = (formData[field] || []) as string[];
      return (
        <div key={field} className="space-y-2">
          <Label>
            {prop.title || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {prop.description && (
            <p className="text-sm text-muted-foreground">{prop.description}</p>
          )}
          <div className="space-y-2">
            {arrayValues.map((item, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={item}
                  onChange={(e) => {
                    const newValues = [...arrayValues];
                    newValues[index] = e.target.value;
                    handleChange(field, newValues);
                  }}
                  placeholder={`项目 ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newValues = arrayValues.filter((_, i) => i !== index);
                    handleChange(field, newValues);
                  }}
                >
                  删除
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                handleChange(field, [...arrayValues, '']);
              }}
            >
              + 添加
            </Button>
          </div>
          {fieldError && <p className="text-sm text-red-500">{fieldError}</p>}
        </div>
      );
    }

    // 对象类型（嵌套）
    if (prop.type === 'object' && prop.properties) {
      return (
        <div key={field} className="space-y-3 border rounded-lg p-4">
          <Label className="text-base font-semibold">
            {prop.title || field}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {prop.description && (
            <p className="text-sm text-muted-foreground">{prop.description}</p>
          )}
          <div className="space-y-3 pl-4">
            {Object.entries(prop.properties).map(([subField, subProp]) => (
              <div key={subField} className="space-y-2">
                <Label htmlFor={`${field}.${subField}`} className="text-sm">
                  {subProp.title || subField}
                </Label>
                <Input
                  id={`${field}.${subField}`}
                  type="text"
                  value={formData[field]?.[subField] || ''}
                  onChange={(e) => {
                    const newValue = {
                      ...(formData[field] || {}),
                      [subField]: e.target.value,
                    };
                    handleChange(field, newValue);
                  }}
                  placeholder={subProp.description}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {Object.entries(schema.properties).map(([field, prop]) => renderField(field, prop))}
    </div>
  );
}
