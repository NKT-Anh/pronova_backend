import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AttemptModule } from './modules/attempt/attempt.module';
import { ChatModule } from './modules/chat/chat.module';
import { FolderModule } from './modules/folder/folder.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { SidebarModule } from './modules/sidebar/sidebar.module';
import { SpeechModule } from './modules/speech/speech.module';
import { SyncModule } from './modules/sync/sync.module';
import { TextItemModule } from './modules/text-item/text-item.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { UserModule } from './modules/user/user.module';
import { SupportModule } from './modules/support/support.module';
import { ProgressModule } from './modules/progress/progress.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UserModule,
    FolderModule,
    TextItemModule,
    AttemptModule,
    ChatModule,
    LanguagesModule,
    UserSettingsModule,
    SidebarModule,
    SpeechModule,
    SyncModule,
    SupportModule,
    ProgressModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
