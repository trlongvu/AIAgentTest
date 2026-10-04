import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

// Lưu ý khi chạy nhiều instance backend: cần thêm Socket.IO Redis adapter
// để sự kiện phát ở instance này tới được client nối vào instance khác.
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
