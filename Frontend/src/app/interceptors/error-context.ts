import { HttpContextToken } from '@angular/common/http';

// Screens with their own error message opt out of the global notification.
export const LOCAL_ERROR_FEEDBACK = new HttpContextToken<boolean>(() => false);
