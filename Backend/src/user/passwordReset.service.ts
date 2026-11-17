import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';
import AppDataSource from '../db';
import { User } from './user.entity';
import { AccountClaimToken } from './accountClaimToken.entity';
import { RefreshToken } from './refreshToken.entity';
import { env } from '../config/env';
import { enqueueEmail } from '../queue/outbox.service';
import { invalidateUserAuthCache } from '../common/middleware/authToken';
import { validatePassword } from './user.service';

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function requestPasswordReset(email: string): Promise<void> {
    await AppDataSource.transaction(async manager => {
        const user = await manager.findOne(User, { where: { email: email.trim().toLowerCase(), active: true }, lock: { mode: 'pessimistic_write' } });
        if (!user || user.deletedAt) return;
        const raw = crypto.randomBytes(48).toString('base64url');
        // Invalidate previous reset links; claims are a separate purpose.
        await manager.update(AccountClaimToken, {userId:user.id, purpose:'reset', usedAt:IsNull()}, {usedAt:new Date()});
        const token = manager.create(AccountClaimToken, {userId:user.id, tokenHash:hash(raw), expiresAt:new Date(Date.now()+30*60*1000), usedAt:null, purpose:'reset', credentialsVersion:user.credentialsVersion});
        await manager.save(token);
        await enqueueEmail(manager, 'reset-'+token.id, {type:'send-account-claim',payload:{userEmail:user.email,userName:user.firstname,claimUrl:env.CLIENT_URL.replace(/\/$/,'')+'/reset-password?token='+encodeURIComponent(raw), purpose:'reset'}});
    });
}

export async function completePasswordReset(token: string, password: string): Promise<boolean> {
    if (!validatePassword(password).valid) return false;
    const passwordHash = await bcrypt.hash(password,12);
    const userId = await AppDataSource.transaction(async manager => {
        const link = await manager.findOne(AccountClaimToken, {where:{tokenHash:hash(token),purpose:'reset',usedAt:IsNull()}});
        if (!link || link.expiresAt<=new Date()) return null;
        const user = await manager.findOne(User, {where:{id:link.userId},lock:{mode:'pessimistic_write'}});
        if (!user?.active || user.deletedAt || user.credentialsVersion!==link.credentialsVersion) return null;
        const consumed = await manager.update(AccountClaimToken,{id:link.id,usedAt:IsNull()},{usedAt:new Date()});
        if (!consumed.affected) return null;
        user.password=passwordHash;
        user.isGuestAccount=false;
        user.credentialsVersion++;
        await manager.save(user);
        await manager.update(AccountClaimToken,{userId:user.id,usedAt:IsNull()},{usedAt:new Date()});
        await manager.update(RefreshToken,{userId:user.id,revokedAt:IsNull()},{revokedAt:new Date()});
        return user.id;
    });
    if (userId) invalidateUserAuthCache(userId);
    return !!userId;
}
