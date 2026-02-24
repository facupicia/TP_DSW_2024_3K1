/**
 * Script de prueba para el flujo de pagos
 * 
 * Ejecutar: npx ts-node scripts/test-payment-flow.ts
 */

import AppDataSource from '../src/db';
import { processApprovedPayment } from '../src/payment/payment.core';
import { PaymentLog } from '../src/payment/payment.entity';
import { Ticket } from '../src/ticket/ticket.entity';

async function testPaymentFlow() {
    try {
        await AppDataSource.initialize();
        console.log('✓ Base de datos conectada');

        // Simular un pago
        const testPaymentId = 'TEST_PAYMENT_' + Date.now();
        const testExternalRef = '1|1|2|1'; // userId|ticketTypeId|quantity|organizerId

        console.log('\n🧪 Simulando pago:', testPaymentId);
        console.log('External Reference:', testExternalRef);

        const mockPaymentData = {
            id: testPaymentId,
            status: 'approved',
            external_reference: testExternalRef,
            transaction_amount: 2000,
            metadata: {},
            additional_info: {}
        };

        const result = await processApprovedPayment(testPaymentId, mockPaymentData);

        console.log('\n📊 Resultado:');
        console.log('Success:', result.success);
        console.log('Error:', result.error || 'Ninguno');
        console.log('Tickets creados:', result.tickets?.length || 0);
        console.log('Log ID:', result.logId);

        // Verificar en la base de datos
        const paymentLogRepo = AppDataSource.getRepository(PaymentLog);
        const ticketRepo = AppDataSource.getRepository(Ticket);

        const log = await paymentLogRepo.findOne({
            where: { mpPaymentId: testPaymentId }
        });

        console.log('\n📝 Log de pago en DB:', log ? '✓ Encontrado' : '✗ No encontrado');
        if (log) {
            console.log('  Status:', log.status);
            console.log('  External Ref:', log.externalReference);
        }

        if (result.tickets && result.tickets.length > 0) {
            const ticketIds = result.tickets.map(t => t.id);
            console.log('\n🎫 Tickets creados:', ticketIds.join(', '));
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await AppDataSource.destroy();
    }
}

testPaymentFlow();
