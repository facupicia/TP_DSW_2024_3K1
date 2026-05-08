from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "business" / "EventLife-modelo-negocio-margenes-2026.pdf"


def money(value: float) -> str:
    return f"${value:,.0f}".replace(",", ".")


def pct(value: float) -> str:
    return f"{value:.2f}%".replace(".", ",")


def neutral_service_fee(platform_fee_percent: float, mp_effective_percent: float) -> float:
    c = platform_fee_percent / 100
    m = mp_effective_percent / 100
    return ((c + m) / (1 - m)) * 100


def scenario(ticket_price: float, service_fee: float, platform_fee: float, mp_effective: float) -> tuple[float, float, float, float]:
    buyer_total = ticket_price * (1 + service_fee / 100)
    eventlife_fee = ticket_price * platform_fee / 100
    mp_cost = buyer_total * mp_effective / 100
    organizer_net = buyer_total - eventlife_fee - mp_cost
    return buyer_total, eventlife_fee, mp_cost, organizer_net


def paragraph(text: str, style):
    return Paragraph(text, style)


def bullets(items: list[str], styles):
    return ListFlowable(
        [ListItem(Paragraph(item, styles["Body"]), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=18,
        bulletFontName="Helvetica",
        bulletFontSize=7,
    )


def table(data, widths=None, small=False):
    style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8 if small else 9),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 7 if small else 8),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#111827")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    return Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1, style=style)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(1.6 * cm, 1.1 * cm, "EventLife - modelo de negocio y margenes")
    canvas.drawRightString(19.4 * cm, 1.1 * cm, f"Pagina {doc.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.7 * cm,
        title="EventLife - Modelo de negocio y margenes",
        author="Codex",
    )

    base = getSampleStyleSheet()
    styles = {
        "Title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=30,
            alignment=TA_LEFT,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=14,
        ),
        "Subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#334155"),
            spaceAfter=18,
        ),
        "H1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=21,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=10,
            spaceAfter=8,
        ),
        "H2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#1E293B"),
            spaceBefore=8,
            spaceAfter=5,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=13,
            textColor=colors.HexColor("#111827"),
            spaceAfter=6,
        ),
        "Small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#475569"),
            spaceAfter=4,
        ),
        "Callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#0F172A"),
            backColor=colors.HexColor("#E0F2FE"),
            borderColor=colors.HexColor("#38BDF8"),
            borderWidth=0.7,
            borderPadding=8,
            spaceAfter=10,
        ),
        "Center": ParagraphStyle(
            "Center",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            alignment=TA_CENTER,
        ),
    }

    today = date(2026, 5, 8)

    mp_rates = [
        ("35 dias", 1.49, 1.49 * 1.21),
        ("18 dias", 3.39, 3.39 * 1.21),
        ("10 dias", 4.39, 4.39 * 1.21),
        ("Al instante", 6.29, 6.29 * 1.21),
    ]

    story = []

    story.append(Paragraph("EventLife", styles["Title"]))
    story.append(Paragraph("Modelo de negocio, margenes y plan de mejora", styles["Title"]))
    story.append(
        Paragraph(
            f"Informe preparado el {today.strftime('%d/%m/%Y')} a partir del modelo actual del backend, "
            "la presentacion comercial de WQR 3.0 aportada como referencia competitiva, y fuentes publicas "
            "de costos de MercadoPago, Render, Netlify, Neon y Brevo.",
            styles["Subtitle"],
        )
    )
    story.append(
        Paragraph(
            "Resumen ejecutivo: EventLife es viable si deja de cobrar su margen desde el bolsillo del organizador "
            "y pasa a un modelo de cargo de servicio al comprador. La plataforma ya tiene los activos dificiles: "
            "checkout, QR, scanner, promotores, dashboard, cupones, tickets y suscripciones. El mayor ajuste no es "
            "tecnico, es de pricing y posicionamiento.",
            styles["Callout"],
        )
    )

    story.append(Paragraph("1. Diagnostico rapido", styles["H1"]))
    story.append(
        bullets(
            [
                "La propuesta es viable para eventos medianos y chicos porque el costo fijo de infraestructura es bajo y el valor operacional para el organizador es alto.",
                "El riesgo principal esta en los unit economics: si EventLife cobra comision sobre el precio publicado y no agrega un cargo de servicio al comprador, el organizador percibe menos y compara negativamente contra WQR.",
                "WQR muestra una logica comercial clara: sumar 15% al asistente, tomar 5% para la plataforma y absorber/explicar MP por separado. Ese enfoque protege al organizador y facilita la venta B2B.",
                "EventLife ya tiene una ventaja funcional: promotores/RRPP con codigos, comisiones, estadisticas, QR, scanner y administracion de eventos. Falta empaquetarlo comercialmente.",
            ],
            styles,
        )
    )

    story.append(Paragraph("2. Modelo actual detectado en el codigo", styles["H1"]))
    story.append(
        table(
            [
                ["Area", "Estado actual", "Impacto en margen"],
                [
                    "Planes",
                    "FREE: 0 ARS, 3 eventos/mes, 1 tipo de entrada, comision 8%. PRO: 4.999 ARS/mes, eventos y tipos ilimitados, comision 2,5%.",
                    "La comision Free es defendible, pero Pro esta barato si realmente reduce comision y abre funcionalidades ilimitadas.",
                ],
                [
                    "Checkout",
                    "El backend calcula comision y la envia como marketplace_fee. El unit_price enviado a MP sigue siendo el precio neto del ticket.",
                    "EventLife cobra, pero el cargo sale del flujo del vendedor/organizador. No hay recargo real al comprador.",
                ],
                [
                    "Validacion webhook",
                    "payment.core.ts valida que transaction_amount coincida con el precio esperado del ticket con descuento.",
                    "Si se agrega cargo de servicio, hay que actualizar esta validacion o los pagos empezaran a fallar por mismatch.",
                ],
                [
                    "Promotores",
                    "Existe PromoterGroup, promoterCode, comisiones por promotor y stats por RRPP.",
                    "Es una ventaja competitiva fuerte contra tickets simples; puede justificar Pro o Enterprise.",
                ],
            ],
            widths=[3.1 * cm, 7.0 * cm, 6.4 * cm],
        )
    )
    story.append(
        Paragraph(
            "Referencias internas: seedSubscriptionPlans.ts define precios y comisiones; preference.service.ts arma marketplace_fee; "
            "payment.core.ts valida montos y guarda logs; promoter.entity.ts y promoter.stats.controller.ts sostienen RRPP.",
            styles["Small"],
        )
    )

    story.append(Paragraph("3. Lectura de competencia WQR", styles["H1"]))
    story.append(
        table(
            [
                ["Elemento WQR", "Lectura comercial", "Oportunidad para EventLife"],
                [
                    "Roles: duenos, jefes de ventas y vendedores directos.",
                    "No venden solo ticketing, venden organizacion de la fuerza comercial.",
                    "EventLife ya tiene RRPP; falta formalizar jerarquias de vendedor, jefe y dueno en UX y reportes.",
                ],
                [
                    "Links propios para vendedores.",
                    "El vendedor publica su link y se mide la venta.",
                    "PromoterCode ya resuelve parte de esto. Se puede mejorar con landing por promotor y share links.",
                ],
                [
                    "Propuesta comercial: QR 1.000, recargo 15%, total asistente 1.150.",
                    "El comprador absorbe el servicio; al organizador le entra mas cercano al precio publicado.",
                    "EventLife debe incorporar cargo de servicio configurable por plan y por evento.",
                ],
                [
                    "Comision WQR 5% y MP 2,99% en el ejemplo.",
                    "Usan un numero simple de explicar: WQR + MP = costo total visible.",
                    "EventLife puede competir con Free 6-8%, Pro 2,5-3,5% y cargo comprador menor para planes pagos.",
                ],
            ],
            widths=[4.2 * cm, 6.0 * cm, 6.3 * cm],
        )
    )

    story.append(PageBreak())
    story.append(Paragraph("4. Formula recomendada de margen", styles["H1"]))
    story.append(
        Paragraph(
            "Objetivo: que el organizador defina un precio de entrada P y reciba P, mientras el comprador paga P + cargo de servicio. "
            "En un split 1:1, MercadoPago descuenta su comision del valor cobrado al comprador y luego se descuenta la comision del marketplace. "
            "Por eso el cargo de servicio no debe calcularse a ojo.",
            styles["Body"],
        )
    )
    story.append(
        table(
            [
                ["Variable", "Significado"],
                ["P", "Precio base publicado por el organizador."],
                ["c", "Comision de EventLife sobre P. Ejemplo: 8% en Free, 2,5% en Pro."],
                ["m", "Costo efectivo de MercadoPago sobre el total cobrado al comprador, incluyendo IVA si aplica."],
                ["T", "Total cobrado al comprador."],
                ["s", "Cargo de servicio porcentual a sumar al comprador."],
            ],
            widths=[2.2 * cm, 14.3 * cm],
        )
    )
    story.append(Paragraph("Formula neutral para que el organizador reciba P:", styles["H2"]))
    story.append(
        Paragraph(
            "<b>s = (c + m) / (1 - m)</b>. Ejemplo: con c = 8% y MP al instante efectivo 7,61%, "
            "el cargo neutral es 16,90%. Con c = 2,5% y MP a 10 dias efectivo 5,31%, el cargo neutral es 8,25%.",
            styles["Callout"],
        )
    )

    neutral_rows = [["Plan EventLife", "MP 35 dias", "MP 18 dias", "MP 10 dias", "MP al instante"]]
    for plan, c in [("Pro 2,5%", 2.5), ("Competitivo 5%", 5.0), ("Free 8%", 8.0)]:
        neutral_rows.append([plan] + [pct(neutral_service_fee(c, r[2])) for r in mp_rates])
    story.append(table(neutral_rows, widths=[3.5 * cm, 3.2 * cm, 3.2 * cm, 3.2 * cm, 3.4 * cm]))
    story.append(
        Paragraph(
            "Nota: se usa IVA 21% sobre las tasas publicadas por MP porque la pagina oficial aclara que los costos de Checkout no incluyen IVA ni retenciones. "
            "Las retenciones provinciales pueden mover el resultado real.",
            styles["Small"],
        )
    )

    story.append(Paragraph("5. Ejemplos con ticket de $1.000", styles["H1"]))
    examples = [["Escenario", "Paga comprador", "EventLife", "MP aprox.", "Organizador neto", "Lectura"]]
    for name, s_fee, c_fee, mp in [
        ("Actual Free sin recargo, MP instante", 0, 8, 7.61),
        ("WQR-like 15%, fee plataforma 5%, MP 2,99% + IVA", 15, 5, 3.62),
        ("EventLife Free 15%, MP 10 dias", 15, 8, 5.31),
        ("EventLife Free 17%, MP instante", 17, 8, 7.61),
        ("EventLife Pro 10%, MP 10 dias", 10, 2.5, 5.31),
        ("EventLife Pro 12%, MP instante", 12, 2.5, 7.61),
    ]:
        buyer, fee, mp_cost, org = scenario(1000, s_fee, c_fee, mp)
        if org >= 1000:
            reading = "Protege precio base"
        elif org >= 950:
            reading = "Aceptable, pero explicar"
        else:
            reading = "Castiga al organizador"
        examples.append([name, money(buyer), money(fee), money(mp_cost), money(org), reading])
    story.append(table(examples, widths=[5.0 * cm, 2.5 * cm, 2.1 * cm, 2.1 * cm, 2.6 * cm, 2.2 * cm], small=True))

    story.append(Paragraph("6. Pricing recomendado", styles["H1"]))
    story.append(
        table(
            [
                ["Plan", "Cliente ideal", "Cargo comprador", "Fee EventLife", "Suscripcion", "Limites/beneficios"],
                [
                    "Starter / Free",
                    "Eventos chicos, validacion del producto",
                    "15% a 17%",
                    "6% a 8%",
                    "$0",
                    "Hasta 2-3 eventos/mes, 1-2 tipos de entrada, marca EventLife, soporte basico.",
                ],
                [
                    "Pro",
                    "Organizadores recurrentes, boliches chicos, productoras universitarias",
                    "9% a 12%",
                    "2,5% a 3,5%",
                    "Revisar a $14.999-$29.999 ARS/mes o precio indexado",
                    "Eventos ilimitados, RRPP, exportaciones, dashboard avanzado, menor cargo visible.",
                ],
                [
                    "Producer",
                    "Productoras medianas con volumen mensual",
                    "7% a 10%",
                    "1,5% a 2,5%",
                    "Custom o minimo mensual",
                    "Soporte prioritario, onboarding, dominio/branding, reportes y conciliacion.",
                ],
                [
                    "Enterprise / Venue",
                    "Locales, venues, fiestas grandes",
                    "Negociado",
                    "Fee bajo + minimo garantizado",
                    "Contrato mensual",
                    "SLA, scanners multiples, cuentas de equipo, jefe de ventas, integraciones.",
                ],
            ],
            widths=[2.3 * cm, 3.3 * cm, 2.7 * cm, 2.5 * cm, 3.2 * cm, 2.5 * cm],
            small=True,
        )
    )
    story.append(
        Paragraph(
            "Recomendacion: vender el plan Free como adquisicion y el Pro como mejora economica. El argumento no debe ser solo funcionalidades; "
            "debe ser 'pagas mensualidad y baja el cargo/comision por entrada'.",
            styles["Callout"],
        )
    )

    story.append(PageBreak())
    story.append(Paragraph("7. Cambios concretos para mejorar margenes", styles["H1"]))

    story.append(Paragraph("Cambios de producto y pricing", styles["H2"]))
    story.append(
        bullets(
            [
                "Agregar cargo de servicio al comprador por plan: serviceFeePercent en SubscriptionPlan o en una tabla PricingRule.",
                "Separar visualmente precio de entrada y cargo de servicio en checkout: 'Entrada $X + cargo de servicio $Y'.",
                "Hacer que Pro reduzca el cargo al comprador, no solo la comision interna. Esa es la palanca que el organizador entiende.",
                "Subir o indexar el precio Pro. $4.999 ARS/mes es bajo frente al valor de vender, escanear, reportar y administrar RRPP.",
                "Crear plan Producer con minimo mensual o minimo por evento para clientes de volumen.",
                "Cobrar add-ons B2B: dominio/branding, soporte en puerta, multiples scanners, exportaciones avanzadas, WhatsApp/email masivo.",
            ],
            styles,
        )
    )

    story.append(Paragraph("Cambios tecnicos en backend", styles["H2"]))
    story.append(
        table(
            [
                ["Archivo/area", "Cambio recomendado", "Por que mejora margen"],
                [
                    "subscription_plan.entity.ts",
                    "Agregar serviceFeePercent, minimumServiceFee, payoutMode o paymentSettlementDays.",
                    "Permite pricing dinamico por plan y evita hardcodear 15% en checkout.",
                ],
                [
                    "seedSubscriptionPlans.ts / subscription.service.ts",
                    "Seedear Starter, Pro, Producer con fee comprador y comision marketplace separados.",
                    "Hace que la estrategia comercial viva en datos y no en logica dispersa.",
                ],
                [
                    "preference.service.ts",
                    "Calcular buyerTotal = precio con descuento + serviceFeeAmount. Enviar unit_price = buyerTotal / cantidad y marketplace_fee = platformFeeAmount.",
                    "El comprador financia el servicio; EventLife deja de restarle margen al organizador.",
                ],
                [
                    "payment.core.ts",
                    "Validar transaction_amount contra buyerTotal, no solo contra expectedTotal del ticket.",
                    "Evita rechazos de webhook cuando exista cargo de servicio.",
                ],
                [
                    "PaymentLog",
                    "Agregar baseAmount, discountAmount, serviceFeeAmount, mpEstimatedFee, organizerExpectedNet.",
                    "Permite medir margen real por pago, plan, evento y promotor.",
                ],
                [
                    "refund.service.ts",
                    "Definir politica: si se reembolsa, se devuelve cargo de servicio completo, parcial o no reembolsable segun terminos.",
                    "Evita perdida inesperada en devoluciones y disputas.",
                ],
                [
                    "Frontend checkout",
                    "Mostrar desglose: entrada, descuento, cargo de servicio, total. Mostrar 'el organizador recibe el precio de entrada'.",
                    "Reduce friccion y reclamos; mejora conversion.",
                ],
            ],
            widths=[3.6 * cm, 7.1 * cm, 5.8 * cm],
            small=True,
        )
    )

    story.append(Paragraph("Cambios de ventas y operacion", styles["H2"]))
    story.append(
        bullets(
            [
                "Posicionar EventLife como sistema de ventas para eventos, no como 'web para vender entradas'. La competencia directa esta vendiendo organizacion comercial.",
                "Ofrecer migracion asistida: carga de evento, tipos de entrada, RRPP y prueba de scanner antes del primer evento.",
                "Medir CAC por organizador y margen por evento. No aceptar eventos chicos con soporte intensivo si no hay minimo o potencial de repeticion.",
                "Hacer piloto con 3 organizadores: uno universitario, un boliche/local y una productora chica. Medir conversion, tickets vendidos, reclamos y costo de soporte.",
                "Construir reporte post-evento automatico: ventas por canal, RRPP, ingresos, tickets escaneados, no-shows y devoluciones.",
            ],
            styles,
        )
    )

    story.append(Paragraph("8. Roadmap de implementacion", styles["H1"]))
    story.append(
        table(
            [
                ["Prioridad", "Accion", "Resultado esperado"],
                ["Semana 1", "Modelar cargo de servicio y actualizar calculo de preferencias MP.", "Unit economics protegidos por transaccion."],
                ["Semana 1", "Actualizar webhook, PaymentLog y tests manuales de pago.", "Menos riesgo operativo en cobros reales."],
                ["Semana 2", "Actualizar checkout frontend con desglose de precio.", "Transparencia y menos reclamos."],
                ["Semana 2", "Crear dashboard de margen: GMV, revenue EventLife, MP estimado, neto organizador.", "Decision de pricing basada en datos."],
                ["Semana 3", "Lanzar pricing Free/Pro/Producer y pagina comercial simple.", "Oferta clara para vender."],
                ["Semana 4", "Pilotos con clientes reales y ajuste de porcentajes.", "Validacion de disposicion a pagar."],
            ],
            widths=[2.5 * cm, 7.0 * cm, 7.0 * cm],
        )
    )

    story.append(Paragraph("9. Riesgos a controlar", styles["H1"]))
    story.append(
        bullets(
            [
                "Retenciones e impuestos: la tasa efectiva de MP puede superar el calculo base. Revisar con cuenta real y contador antes de fijar margen final.",
                "Reembolsos: MP puede devolver proporcionalmente la parte del marketplace. Definir terminos para cargo de servicio.",
                "Promotores: si la comision RRPP sale del organizador, dejarlo claro. Si sale del cargo de servicio, recalcular margen.",
                "Conversion: cargos altos pueden bajar compra. Conviene A/B o pilotos con 10%, 12%, 15% y 17%.",
                "Soporte en eventos: un cliente grande puede consumir margen si exige asistencia en puerta sin costo.",
            ],
            styles,
        )
    )

    story.append(Paragraph("10. Fuentes y notas", styles["H1"]))
    story.append(
        bullets(
            [
                "Presentacion WQR 3.0 aportada por el usuario: roles comerciales, links de venta, flujo de QR y ejemplo de recargo 15%.",
                "MercadoPago Argentina: costos de Checkout. La fuente publica indica que la acreditacion inmediata puede costar 6,29% y que esos costos no incluyen IVA ni retenciones.",
                "MercadoPago Developers Split Payments 1:1: para Checkout Pro se usa marketplace_fee; la comision de MP se descuenta del vendedor antes de la comision del marketplace.",
                "Render pricing: Web Service Starter USD 7/mes, Redis-compatible Key Value Starter USD 10/mes, Postgres Basic desde USD 6/mes.",
                "Netlify pricing: Free con creditos incluidos y Personal USD 9/mes; usar alertas para evitar sorpresas de trafico.",
                "Neon pricing: plan gratuito y planes pagos con compute/storage escalables; validar costo segun uso real.",
                "Brevo pricing/help: plan Free con 300 emails diarios; Starter desde USD 9/mes segun volumen.",
            ],
            styles,
        )
    )
    story.append(
        Paragraph(
            "Este informe es una guia de negocio y producto, no asesoramiento contable o legal. Antes de publicar precios finales, validar impuestos, retenciones, terminos de reembolso y contratos con proveedores.",
            styles["Small"],
        )
    )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build()
    print(OUTPUT)
