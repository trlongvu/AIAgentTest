import Shell from '@/components/Shell';
import './globals.css';

export const metadata = {
  title: 'AI CRM',
  description: 'Trợ lý AI trả lời tin nhắn đa kênh',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
