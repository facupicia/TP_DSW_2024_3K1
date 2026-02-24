import crypto from 'crypto';
import { logger } from './logger';

/**
 * Encryption Service
 * 
 * Proporciona encriptación AES-256-GCM para datos sensibles.
 * Usado para almacenar tokens de MercadoPago de forma segura.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

/**
 * Inicializa la clave de encriptación desde la variable de entorno
 */
function getEncryptionKey(): Buffer {
    if (encryptionKey) return encryptionKey;
    
    const envKey = process.env.ENCRYPTION_KEY;
    
    if (!envKey) {
        // En desarrollo, generar una clave derivada del SECRET_KEY
        if (process.env.NODE_ENV === 'development') {
            const fallbackKey = process.env.SECRET_KEY || 'default-dev-key-not-for-production';
            encryptionKey = crypto.scryptSync(fallbackKey, 'salt', KEY_LENGTH);
            logger.warn('ENCRYPTION_USING_FALLBACK_KEY', { 
                message: 'Using fallback encryption key - set ENCRYPTION_KEY in production!' 
            });
            return encryptionKey;
        }
        
        throw new Error(
            'ENCRYPTION_KEY environment variable is required in production. ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    
    // La clave debe ser hex de 64 caracteres (32 bytes)
    if (envKey.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    
    encryptionKey = Buffer.from(envKey, 'hex');
    return encryptionKey;
}

export interface EncryptedData {
    encrypted: string;
    iv: string;
    authTag: string;
}

/**
 * Encripta un texto usando AES-256-GCM
 */
export function encrypt(text: string | null | undefined): EncryptedData | null {
    if (!text) return null;
    
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    } catch (error) {
        logger.error('ENCRYPTION_ERROR', { error: (error as Error).message });
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Desencripta datos previamente encriptados con AES-256-GCM
 */
export function decrypt(data: EncryptedData | null | undefined): string | null {
    if (!data || !data.encrypted) return null;
    
    try {
        const key = getEncryptionKey();
        const iv = Buffer.from(data.iv, 'hex');
        const authTag = Buffer.from(data.authTag, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        logger.error('DECRYPTION_ERROR', { error: (error as Error).message });
        throw new Error('Failed to decrypt data - data may be corrupted or tampered');
    }
}

/**
 * Encripta un texto y retorna un string JSON seguro para almacenar
 */
export function encryptToString(text: string | null | undefined): string | null {
    const encrypted = encrypt(text);
    return encrypted ? JSON.stringify(encrypted) : null;
}

/**
 * Desencripta un string JSON previamente encriptado
 */
export function decryptFromString(encryptedString: string | null | undefined): string | null {
    if (!encryptedString) return null;
    
    try {
        const data = JSON.parse(encryptedString) as EncryptedData;
        return decrypt(data);
    } catch (error) {
        // Si no es JSON válido, podría ser un token sin encriptar (migración)
        // En ese caso, retornar el valor original
        return encryptedString;
    }
}

/**
 * Rota la encriptación de un valor con una nueva clave
 * Útil para rotación de claves
 */
export function rotateEncryption(
    encryptedData: EncryptedData, 
    newKey: Buffer
): EncryptedData {
    const decrypted = decrypt(encryptedData);
    if (!decrypted) throw new Error('Cannot rotate encryption: failed to decrypt');
    
    // Temporalmente cambiar la clave
    const oldKey = encryptionKey;
    encryptionKey = newKey;
    
    try {
        return encrypt(decrypted)!;
    } finally {
        encryptionKey = oldKey;
    }
}

/**
 * Genera una nueva clave de encriptación segura
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
