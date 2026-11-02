import { describe, expect, it, vi } from 'vitest';
import { afterEach, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { renderMemberMentions } from './mentionText.jsx';

afterEach(() => cleanup());

describe('renderMemberMentions', () => {
  it('turns valid @usernames into profile actions while preserving surrounding text', () => {
    const onOpenMention = vi.fn();
    render(<p>{renderMemberMentions('Hai @kopi_senja, sampai jumpa!', onOpenMention)}</p>);
    const mention = screen.getByRole('button', { name: '@kopi_senja' });
    expect(screen.getByText('Hai', { exact: false })).toBeTruthy();
    fireEvent.click(mention);
    expect(onOpenMention).toHaveBeenCalledWith('kopi_senja');
    expect(screen.getByText(/sampai jumpa!/)).toBeTruthy();
  });

  it('does not turn email addresses or invalid short handles into profile actions', () => {
    render(<p>{renderMemberMentions('mail admin@example.com dan @ab', vi.fn())}</p>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('mail admin@example.com dan @ab')).toBeTruthy();
  });
});
