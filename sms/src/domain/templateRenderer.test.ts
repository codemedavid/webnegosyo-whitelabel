import { renderTemplate, TemplateVariableError } from './templateRenderer';

describe('renderTemplate', () => {
  it('replaces a single placeholder with its value', () => {
    expect(renderTemplate('Hi {{firstName}}!', { firstName: 'Jane' })).toBe('Hi Jane!');
  });

  it('replaces multiple distinct placeholders', () => {
    const result = renderTemplate('Hi {{firstName}}, this is {{business}}.', {
      firstName: 'Jane',
      business: 'Acme Co',
    });

    expect(result).toBe('Hi Jane, this is Acme Co.');
  });

  it('replaces repeated occurrences of the same placeholder', () => {
    expect(renderTemplate('{{firstName}} {{firstName}}', { firstName: 'Jane' })).toBe('Jane Jane');
  });

  it('returns the body unchanged when it has no placeholders', () => {
    expect(renderTemplate('Just a plain message.', {})).toBe('Just a plain message.');
  });

  it('tolerates extra whitespace inside braces', () => {
    expect(renderTemplate('Hi {{ firstName }}!', { firstName: 'Jane' })).toBe('Hi Jane!');
  });

  it('accepts an empty string as a valid variable value', () => {
    expect(renderTemplate('Hi {{firstName}}!', { firstName: '' })).toBe('Hi !');
  });

  it('ignores variables that are not referenced by the template', () => {
    expect(renderTemplate('Hi {{firstName}}!', { firstName: 'Jane', unused: 'x' })).toBe('Hi Jane!');
  });

  it('throws TemplateVariableError when a placeholder has no matching variable', () => {
    expect(() => renderTemplate('Hi {{firstName}}!', {})).toThrow(TemplateVariableError);
  });

  it('lists every missing variable name in the thrown error', () => {
    try {
      renderTemplate('Hi {{firstName}}, re: {{appointmentDate}}', {});
      throw new Error('expected renderTemplate to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateVariableError);
      expect((error as TemplateVariableError).missingVariables).toEqual(['firstName', 'appointmentDate']);
    }
  });
});
