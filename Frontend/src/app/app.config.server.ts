import { provideServerRendering } from '@angular/ssr';
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { appConfig } from './app.config';
import {  provideNgxMask } from 'ngx-mask';

const serverConfig: ApplicationConfig = {
  providers: [
    provideNgxMask(),
    provideServerRendering()
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
