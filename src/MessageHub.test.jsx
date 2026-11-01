import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MessageHub from './MessageHub.jsx';

describe('MessageHub', () => {
  it('starts on private messages and explains that the backend is not implemented yet', () => {
    render(<MessageHub />);
    expect(screen.getByRole('tab', { name: 'Pribadi', selected: true })).toBeTruthy();
    expect(screen.getByText(/belum tersedia/i)).toBeTruthy();
  });

  it('switches between the three planned sections without showing fabricated data', () => {
    render(<MessageHub />);
    fireEvent.click(screen.getByRole('tab', { name: 'Komunitas' }));
    expect(screen.getByRole('tab', { name: 'Komunitas', selected: true })).toBeTruthy();
    expect(screen.getByText(/komunitas resmi/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Teman' }));
    expect(screen.getByRole('tab', { name: 'Teman', selected: true })).toBeTruthy();
    expect(screen.getByText(/mutual follow/i)).toBeTruthy();
  });
});
