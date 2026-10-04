'use client';

import { useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getToken } from './api';

let staffSocket;

// Socket của nhân viên: gửi JWT, nhận sự kiện của mọi hội thoại
function getStaffSocket() {
  staffSocket ??= io(API_URL, { auth: { token: getToken() } });
  return staffSocket;
}

export function useStaffSocketEvent(event, handler) {
  useEffect(() => {
    const socket = getStaffSocket();
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [event, handler]);
}

// Socket của khách (trang Chat thử): chỉ nhận tin của đúng hội thoại của mình
export function useCustomerSocket(conversationId, onMessage) {
  const socket = useMemo(
    () => (conversationId ? io(API_URL, { auth: { conversationId }, forceNew: true }) : null),
    [conversationId],
  );

  useEffect(() => {
    if (!socket) return;
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
      socket.disconnect();
    };
  }, [socket, onMessage]);
}

export function resetStaffSocket() {
  staffSocket?.disconnect();
  staffSocket = undefined;
}
