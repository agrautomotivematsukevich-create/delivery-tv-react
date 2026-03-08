import React, { useState, useEffect } from 'react';

interface NotificationProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number; // in milliseconds
}

const Notification: React.FC<NotificationProps> = ({ message, type = 'info', duration = 3000 }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  const typeStyles = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white',
  };

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg ${typeStyles[type]} transition-opacity`}
    >
      {message}
    </div>
  );
};

export default Notification;