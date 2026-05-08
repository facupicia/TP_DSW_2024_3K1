from __future__ import annotations

from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "business" / "EventLife-estimacion-ganancias-duenio-2026.pdf"


def money(value: float) -> str:
    return f"${value:,.0f}".replace(",", ".")


def pct(value: float) -> str:
    return f"{value:.2f}%".replace(".", ",")


def calc_event(ticket_price: float, tickets: int, service_fee: float, eventlife_fee: float, mp_effective: float) -> dict[str, float]:
    gmv = ticket_price * tickets
    buyer_total = gmv * (1 + service_fee / 100)
    eventlife_revenue = gmv * eventlife_fee / 100
    mp_cost = buyer_total * mp_effective / 100
    organizer_net = buyer_total - eventlife_revenue - mp_cost
    return {
        "gmv": gmv,
        "buyer_total": buyer_total,
        "eventlife_revenue": eventlife_revenue,
        "mp_cost": mp_cost,
        "organizer_net": organizer_net,
        "organizer_net_percent": organizer_net / gmv * 100 if gmv else 0,
    }


def weighted_rate(parts: list[tuple[float, float]]) -> float:
    return sum(weight * rate for weight, rate in parts)


def monthly_current(gmv: float, organizers: int, pro_share: float = 0.2, pro_price: float = 4_999) -> float:
    current_rate = weighted_rate([(0.8, 0.08), (0.2, 0.025)])
    return gmv * current_rate + round(organizers * pro_share) * pro_price


def monthly_optimal(gmv: float, organizers: int, growth: float = 1.0) -> float:
    # 60% Starter at 8.5%, 30% Pro at 3.5%, 10% Producer at 2.5%.
    # Paid plans add subscription/minimum revenue.
    optimal_rate = weighted_rate([(0.6, 0.085), (0.3, 0.035), (0.1, 0.025)])
    pro_count = round(organizers * 0.3)
    producer_count = round(organizers * 0.1)
    return (gmv * growth) * optimal_rate + pro_count * 29_999 + producer_count * 100_000


def make_styles():
    base = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            alignment=TA_LEFT,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=12,
        ),
        "Subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#334155"),
            spaceAfter=14,
        ),
        "H1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=9,
            spaceAfter=7,
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
            fontSize=9.2,
            leading=12.8,
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
            leading=13.5,
            textColor=colors.HexColor("#0F172A"),
            backColor=colors.HexColor("#E0F2FE"),
            borderColor=colors.HexColor("#38BDF8"),
            borderWidth=0.7,
            borderPadding=8,
            spaceAfter=10,
        ),
    }


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
    header_style = ParagraphStyle(
        "TableHeader",
        fontName="Helvetica-Bold",
        fontSize=7.6 if small else 8.5,
        leading=9.5 if small else 10.5,
        textColor=colors.white,
    )
    cell_style = ParagraphStyle(
        "TableCell",
        fontName="Helvetica",
        fontSize=6.9 if small else 7.8,
        leading=8.7 if small else 10,
        textColor=colors.HexColor("#111827"),
    )

    def wrap(value, is_header=False):
        value = "" if value is None else str(value)
        return Paragraph(escape(value), header_style if is_header else cell_style)

    wrapped = [[wrap(cell, r == 0) for cell in row] for r, row in enumerate(data)]
    style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    return Table(wrapped, colWidths=widths, hAlign="LEFT", repeatRows=1, style=style)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(1.6 * cm, 1.1 * cm, "EventLife - estimacion de ganancias del duenio")
    canvas.drawRightString(19.4 * cm, 1.1 * cm, f"Pagina {doc.page}")
    canvas.restoreState()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = make_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=1.6 * cm,
        leftMargin=1.6 * cm,
        topMargin=1.55 * cm,
        bottomMargin=1.7 * cm,
        title="EventLife - Estimacion de ganancias del duenio",
        author="Codex",
    )

    ticket_price = 10_000
    tickets_per_event = 500
    mp_instant = 6.29 * 1.21
    mp_10_days = 4.39 * 1.21

    story = []
    story.append(Paragraph("EventLife", styles["Title"]))
    story.append(Paragraph("Estimacion de ganancias para el duenio de la app", styles["Title"]))
    story.append(
        Paragraph(
            f"Informe generado el {date(2026, 5, 8).strftime('%d/%m/%Y')}. Los importes son estimaciones "
            "en ARS antes de impuestos propios, soporte, devoluciones, retenciones provinciales y costos fijos. "
            "El objetivo es comparar la rentabilidad bruta del modelo actual contra una estructura optimizada "
            "con cargo de servicio al comprador.",
            styles["Subtitle"],
        )
    )
    story.append(
        Paragraph(
            "Conclusion principal: como esta ahora, EventLife puede generar buen ingreso por comision, pero lo hace "
            "a costa del organizador. La forma mas optima es cobrar el servicio al comprador, mantener entero el "
            "precio base del organizador y monetizar con marketplace_fee + suscripciones/minimos mensuales.",
            styles["Callout"],
        )
    )

    story.append(Paragraph("1. Supuestos usados", styles["H1"]))
    story.append(
        table(
            [
                ["Variable", "Valor usado", "Comentario"],
                ["Ticket promedio", money(ticket_price), "Precio base publicado por el organizador."],
                ["Tickets por evento ejemplo", str(tickets_per_event), "Evento mediano para simular margen."],
                ["GMV por evento ejemplo", money(ticket_price * tickets_per_event), "Precio base x tickets vendidos."],
                ["MP al instante", pct(mp_instant), "6,29% + IVA. No incluye retenciones."],
                ["MP a 10 dias", pct(mp_10_days), "4,39% + IVA. No incluye retenciones."],
                ["Ingreso EventLife", "marketplace_fee + suscripciones", "No se resta MP como costo propio si el split lo descuenta del vendedor, pero afecta el neto del organizador."],
            ],
            widths=[4.2 * cm, 4.0 * cm, 8.3 * cm],
        )
    )

    story.append(Paragraph("2. Ganancia por ticket", styles["H1"]))
    story.append(
        table(
            [
                ["Modelo", "Precio base", "Fee EventLife", "Ingreso tuyo por ticket", "Lectura"],
                ["Actual Free", money(ticket_price), "8%", money(ticket_price * 0.08), "Buen ingreso para vos, pero castiga al organizador si no hay recargo comprador."],
                ["Actual Pro", money(ticket_price), "2,5%", money(ticket_price * 0.025), "Demasiado barato si el organizador vende volumen alto."],
                ["Optimo Starter", money(ticket_price), "8,5%", money(ticket_price * 0.085), "Similar a Free, pero financiado con cargo al comprador."],
                ["Optimo Pro", money(ticket_price), "3,5% a 5%", f"{money(ticket_price * 0.035)} a {money(ticket_price * 0.05)}", "Menor fee por venta, compensado con suscripcion seria."],
                ["Optimo Producer", money(ticket_price), "2,5% a 3,5%", f"{money(ticket_price * 0.025)} a {money(ticket_price * 0.035)}", "Solo conviene con minimo mensual o contrato."],
            ],
            widths=[3.2 * cm, 2.5 * cm, 2.7 * cm, 3.4 * cm, 4.7 * cm],
        )
    )

    story.append(Paragraph("3. Evento ejemplo: 500 tickets de $10.000", styles["H1"]))
    rows = [["Escenario", "Paga comprador", "Ganancia EventLife", "Costo MP aprox.", "Neto organizador", "Lectura"]]
    event_scenarios = [
        ("Actual Free: 8%, sin recargo", 0, 8, mp_instant),
        ("Actual Pro: 2,5%, sin recargo", 0, 2.5, mp_instant),
        ("Optimo Starter: 15% comprador, 8,5%, MP 10 dias", 15, 8.5, mp_10_days),
        ("Optimo Pro: 12% comprador, 3,5%, MP instante", 12, 3.5, mp_instant),
        ("WQR-like: 15% comprador, 5%, MP 10 dias", 15, 5, mp_10_days),
    ]
    for name, service_fee, app_fee, mp_rate in event_scenarios:
        result = calc_event(ticket_price, tickets_per_event, service_fee, app_fee, mp_rate)
        reading = "Organizador protegido" if result["organizer_net_percent"] >= 99.5 else "Organizador pierde margen"
        rows.append(
            [
                name,
                money(result["buyer_total"]),
                money(result["eventlife_revenue"]),
                money(result["mp_cost"]),
                f"{money(result['organizer_net'])} ({pct(result['organizer_net_percent'])})",
                reading,
            ]
        )
    story.append(table(rows, widths=[4.4 * cm, 2.5 * cm, 2.5 * cm, 2.4 * cm, 2.9 * cm, 1.8 * cm], small=True))
    story.append(
        Paragraph(
            "Lectura: el modelo actual Free te deja $400.000 por evento de $5M, pero el organizador recibe aprox. 84,39% del precio base "
            "si MP descuenta al instante. En el modelo Starter optimo, vos ganarias $425.000 y el organizador quedaria alrededor del 100,39% "
            "del precio base, porque el comprador financia el servicio.",
            styles["Body"],
        )
    )

    story.append(Paragraph("4. Estimacion mensual", styles["H1"]))
    monthly_rows = [["Escenario", "Organizadores", "Tickets/mes", "GMV base", "Como esta ahora", "Optimo mismo volumen", "Optimo +50% volumen"]]
    monthly_cases = [
        ("Conservador", 5, 1_250, 12_500_000),
        ("Medio", 15, 9_000, 90_000_000),
        ("Fuerte", 30, 36_000, 360_000_000),
    ]
    for name, organizers, tickets, gmv in monthly_cases:
        current = monthly_current(gmv, organizers)
        optimal_same = monthly_optimal(gmv, organizers, 1.0)
        optimal_growth = monthly_optimal(gmv, organizers, 1.5)
        monthly_rows.append(
            [
                name,
                str(organizers),
                f"{tickets:,}".replace(",", "."),
                money(gmv),
                money(current),
                money(optimal_same),
                money(optimal_growth),
            ]
        )
    story.append(table(monthly_rows, widths=[2.5 * cm, 1.9 * cm, 2.1 * cm, 2.7 * cm, 2.6 * cm, 2.7 * cm, 2.7 * cm], small=True))
    story.append(
        Paragraph(
            "A mismo volumen, el modelo actual puede parecer apenas mejor porque cobra 8% a muchos clientes. El modelo optimo gana "
            "cuando aumenta conversion, retencion y volumen: con 50% mas GMV, la ganancia bruta mensual sube fuerte sin destruir el neto del organizador.",
            styles["Callout"],
        )
    )

    story.append(PageBreak())
    story.append(Paragraph("5. Punto critico del Pro actual", styles["H1"]))
    current_pro_price = 4_999
    current_break_even = current_pro_price / (0.08 - 0.025)
    recommended_pro_price = 29_999
    recommended_break_even = recommended_pro_price / (0.085 - 0.04)
    story.append(
        table(
            [
                ["Comparacion", "Formula", "Resultado", "Interpretacion"],
                [
                    "Pro actual",
                    "$4.999 / (8% - 2,5%)",
                    money(current_break_even),
                    "Si un organizador Pro vende mas de este GMV mensual, a vos te convendria mas que estuviera en Free. Es demasiado bajo.",
                ],
                [
                    "Pro recomendado",
                    "$29.999 / (8,5% - 4%)",
                    money(recommended_break_even),
                    "Con suscripcion mas alta y fee Pro 4%, el plan puede escalar mejor sin regalar margen.",
                ],
            ],
            widths=[3.3 * cm, 4.2 * cm, 3.1 * cm, 5.9 * cm],
        )
    )
    story.append(
        Paragraph(
            "Esto es central: el Pro actual baja mucho la comision y cobra muy poco fijo. Por eso funciona como beneficio para el organizador, "
            "pero no como plan rentable para EventLife si el cliente vende volumen.",
            styles["Body"],
        )
    )

    story.append(Paragraph("6. Forma mas optima recomendada", styles["H1"]))
    story.append(
        table(
            [
                ["Plan", "Cargo al comprador", "Fee EventLife", "Suscripcion/minimo", "Uso recomendado"],
                ["Starter", "15% a 17%", "8% a 8,5%", "$0", "Adquisicion, eventos chicos, prueba de producto."],
                ["Pro", "10% a 12%", "4% a 5%", "$29.999 a $49.999/mes", "Organizadores recurrentes. Bajar cargo visible y dar RRPP/dashboard."],
                ["Producer", "8% a 10%", "2,5% a 3,5%", "$100.000 a $250.000 minimo mensual", "Productoras, venues, boliches o clientes de volumen."],
                ["Enterprise", "Negociado", "1,5% a 3%", "Contrato", "Soporte, SLA, scanners multiples, onboarding y reportes custom."],
            ],
            widths=[2.3 * cm, 3.2 * cm, 2.7 * cm, 3.7 * cm, 4.6 * cm],
        )
    )
    story.append(
        bullets(
            [
                "No vendas 'te saco una comision'. Vende 'vos definis el precio, el comprador paga el cargo de servicio y vos conservas el precio base'.",
                "El cargo de servicio debe cubrir MP + margen EventLife. Si se acredita al instante, Starter deberia estar mas cerca de 17% que de 15%.",
                "Pro debe mejorar la economia visible para el organizador, pero no puede regalarse: necesita suscripcion real o minimo mensual.",
                "Producer solo conviene con minimo mensual. Si no, un fee bajo de 2,5% puede dejarte poca ganancia frente al soporte que exige el cliente.",
            ],
            styles,
        )
    )

    story.append(Paragraph("7. Formula simple para decidir cargos", styles["H1"]))
    story.append(
        Paragraph(
            "Para que el organizador reciba aproximadamente su precio base P, el cargo de servicio minimo al comprador deberia cumplir: "
            "<b>cargo = (fee EventLife + costo MP efectivo) / (1 - costo MP efectivo)</b>.",
            styles["Body"],
        )
    )
    formula_rows = [["Fee EventLife", "MP 10 dias", "MP al instante", "Recomendacion"]]
    for fee in [3.5, 5.0, 8.5]:
        need_10 = (fee / 100 + mp_10_days / 100) / (1 - mp_10_days / 100) * 100
        need_instant = (fee / 100 + mp_instant / 100) / (1 - mp_instant / 100) * 100
        formula_rows.append(
            [
                pct(fee),
                pct(need_10),
                pct(need_instant),
                "Redondear hacia arriba y validar conversion.",
            ]
        )
    story.append(table(formula_rows, widths=[3.0 * cm, 3.0 * cm, 3.0 * cm, 7.5 * cm]))

    story.append(Paragraph("8. Riesgos y notas", styles["H1"]))
    story.append(
        bullets(
            [
                "Los numeros son ganancia bruta para EventLife. Hay que restar impuestos propios, soporte, hosting, emails, devoluciones, disputas y posibles retenciones.",
                "MercadoPago publica costos sin IVA ni retenciones; por eso el costo real puede variar por provincia, cuenta y medio de pago.",
                "En split 1:1, MercadoPago descuenta primero su comision del vendedor y luego la comision marketplace. Esto afecta la percepcion del organizador.",
                "Si el cargo comprador sube demasiado, puede bajar la conversion. Conviene probar 10%, 12%, 15% y 17% por tipo de evento.",
                "No todos los eventos valen igual: un evento chico con mucho soporte puede ser menos rentable que uno mediano repetible.",
            ],
            styles,
        )
    )

    story.append(Paragraph("9. Fuentes", styles["H1"]))
    story.append(
        bullets(
            [
                "MercadoPago Argentina - costos de Checkout: la acreditacion inmediata puede costar 6,29% y la pagina aclara que los costos no incluyen IVA ni retenciones.",
                "MercadoPago Developers - Split Payments 1:1: Checkout Pro usa marketplace_fee y la comision MP se descuenta antes de la comision del marketplace.",
                "Modelo EventLife actual: seedSubscriptionPlans.ts define Free 8% y Pro 2,5% + $4.999; preference.service.ts usa marketplace_fee.",
                "Presentacion WQR 3.0 aportada: referencia de cargo comprador 15%, comision plataforma 5% y flujo de vendedores/link/QR.",
            ],
            styles,
        )
    )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build()
    print(OUTPUT)
