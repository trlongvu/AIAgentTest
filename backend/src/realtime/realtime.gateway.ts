import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

// Kênh realtime (Socket.IO) giữa backend và dashboard.
// - Nhân viên kết nối kèm JWT -> vào phòng "staff", nhận mọi sự kiện.
// - Trang Chat thử (khách web) kết nối không token -> chỉ nhận tin của hội thoại mình (phòng "conversation:<id>").
// cors origin: true -> chấp nhận mọi origin; an toàn vì nhân viên xác thực bằng JWT, không dùng cookie
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (token) {
      try {
        await this.jwt.verifyAsync(token);
        await client.join('staff');
        return;
      } catch {
        this.logger.warn('Socket gửi token không hợp lệ');
        client.disconnect();
        return;
      }
    }
    const conversationId = Number(client.handshake.auth?.conversationId);
    if (conversationId) await client.join(`conversation:${conversationId}`);
  }

  emitMessage(conversationId: number, message: unknown) {
    this.server.to('staff').to(`conversation:${conversationId}`).emit('message:new', { conversationId, message });
  }

  emitConversationUpdated(conversation: unknown) {
    this.server.to('staff').emit('conversation:updated', { conversation });
  }
}
