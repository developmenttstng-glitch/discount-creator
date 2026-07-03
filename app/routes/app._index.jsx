import { Link } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ── Loader: fetch all discounts ───────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    #graphql
    query getDiscounts {
      codeDiscountNodes(first: 50) {
        nodes {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              codes(first: 1) { nodes { code } }
              usageLimit
              startsAt
              endsAt
              asyncUsageCount
              customerGets {
                value {
                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount currencyCode } }
                }
              }
            }
          }
        }
      }
    }
  `);

  const json      = await response.json();
  const discounts = json.data?.codeDiscountNodes?.nodes || [];
  return { discounts };
};

// ── Action: delete ────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData  = await request.formData();
  const intent    = formData.get("intent");

  if (intent === "delete") {
    const id = formData.get("id");
    await admin.graphql(
      `#graphql
      mutation deleteDiscount($id: ID!) {
        discountCodeDelete(id: $id) {
          deletedCodeDiscountId
          userErrors { field message }
        }
      }`,
      { variables: { id } }
    );
    return { deleted: true };
  }

  return null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getValueLabel(val) {
  if (!val) return "—";
  if (val.percentage) return `${Math.round(val.percentage * 100)}% off`;
  if (val.amount) return `${val.amount.currencyCode} ${parseFloat(val.amount.amount).toFixed(2)} off`;
  return "—";
}

function getStatusStyle(status) {
  switch (status) {
    case "ACTIVE":    return { bg:"#d4edda", color:"#155724" };
    case "EXPIRED":   return { bg:"#f8d7da", color:"#721c24" };
    case "SCHEDULED": return { bg:"#fff3cd", color:"#856404" };
    default:          return { bg:"#e2e3e5", color:"#383d41" };
  }
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
}

function isExpiringSoon(endsAt) {
  if (!endsAt) return false;
  const diff = new Date(endsAt) - new Date();
  return diff > 0 && diff < 1000 * 60 * 60 * 24 * 3; // within 3 days
}

// ── UI ────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { discounts } = useLoaderData();
  const fetcher       = useFetcher();
  const shopify       = useAppBridge();

  if (fetcher.data?.deleted) shopify.toast.show("Discount deleted.");

  const total     = discounts.length;
  const active    = discounts.filter(n => n.codeDiscount?.status === "ACTIVE").length;
  const expired   = discounts.filter(n => n.codeDiscount?.status === "EXPIRED").length;
  const scheduled = discounts.filter(n => n.codeDiscount?.status === "SCHEDULED").length;

  const card = {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "20px 24px",
    flex: 1,
    minWidth: 140,
  };

  const th = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "#6d7175",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "2px solid #e1e3e5",
    whiteSpace: "nowrap",
  };

  const td = {
    padding: "12px 14px",
    fontSize: 13,
    color: "#202223",
    borderBottom: "1px solid #f1f2f3",
    verticalAlign: "middle",
  };

  return (
    <s-page heading="Discount Manager">

      {/* New Discount Button */}
      <div slot="primary-action">
        <Link to="/app/discounts/new">
          <button style={{
            padding: "8px 16px",
            background: "#008060",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}>
            + New Discount
          </button>
        </Link>
      </div>

      {/* Summary Cards */}
      <s-section>
        <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:8 }}>
          <div style={card}>
            <div style={{ fontSize:12, color:"#6d7175", marginBottom:4 }}>Total</div>
            <div style={{ fontSize:28, fontWeight:700, color:"#202223" }}>{total}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize:12, color:"#6d7175", marginBottom:4 }}>Active</div>
            <div style={{ fontSize:28, fontWeight:700, color:"#008060" }}>{active}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize:12, color:"#6d7175", marginBottom:4 }}>Scheduled</div>
            <div style={{ fontSize:28, fontWeight:700, color:"#b98900" }}>{scheduled}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize:12, color:"#6d7175", marginBottom:4 }}>Expired</div>
            <div style={{ fontSize:28, fontWeight:700, color:"#d82c0d" }}>{expired}</div>
          </div>
        </div>
      </s-section>

      {/* Discounts Table */}
      <s-section heading="All Discounts">
        {discounts.length === 0 ? (
          <div style={{ textAlign:"center", padding:"48px 0", color:"#6d7175" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🏷️</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>No discounts yet</div>
            <div style={{ fontSize:13 }}>Create your first discount to get started.</div>
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr>
                  <th style={th}>Code</th>
                  <th style={th}>Title</th>
                  <th style={th}>Value</th>
                  <th style={th}>Status</th>
                  <th style={th}>Used</th>
                  <th style={th}>Limit</th>
                  <th style={th}>Ends</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((node) => {
                  const d      = node.codeDiscount;
                  const code   = d?.codes?.nodes?.[0]?.code || "—";
                  const val    = d?.customerGets?.value;
                  const status = d?.status || "—";
                  const st     = getStatusStyle(status);
                  const expiring = isExpiringSoon(d?.endsAt);

                  return (
                    <tr key={node.id} style={{ background:"#fff" }}
                      onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                      onMouseLeave={e => e.currentTarget.style.background="#fff"}>

                      <td style={td}>
                        <span style={{ fontWeight:700, fontFamily:"monospace", fontSize:13 }}>
                          {code}
                        </span>
                      </td>

                      <td style={td}>{d?.title || "—"}</td>

                      <td style={td}>
                        <span style={{ fontWeight:600, color:"#008060" }}>
                          {getValueLabel(val)}
                        </span>
                      </td>

                      <td style={td}>
                        <span style={{
                          padding:"3px 10px", borderRadius:12, fontSize:11,
                          fontWeight:600, background:st.bg, color:st.color,
                        }}>
                          {status}
                        </span>
                      </td>

                      <td style={td}>
                        <span style={{ fontWeight:600 }}>
                          {d?.asyncUsageCount ?? 0}
                        </span>
                      </td>

                      <td style={td}>{d?.usageLimit ?? "Unlimited"}</td>

                      <td style={td}>
                        <span style={{ color: expiring ? "#d82c0d" : "inherit" }}>
                          {expiring && "⚠️ "}
                          {formatDate(d?.endsAt)}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <Link to={`/app/discounts/${encodeURIComponent(node.id)}`}>
                            <button style={{
                              padding:"4px 12px", background:"#f1f2f3",
                              border:"1px solid #e1e3e5", borderRadius:4,
                              fontSize:12, cursor:"pointer", fontWeight:500,
                            }}>
                              View
                            </button>
                          </Link>
                          <fetcher.Form method="POST">
                            <input type="hidden" name="intent" value="delete"/>
                            <input type="hidden" name="id" value={node.id}/>
                            <button type="submit" style={{
                              padding:"4px 12px", background:"#fff",
                              border:"1px solid #d82c0d", borderRadius:4,
                              fontSize:12, cursor:"pointer", color:"#d82c0d", fontWeight:500,
                            }}>
                              Delete
                            </button>
                          </fetcher.Form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Tips">
        <s-paragraph>
          Click <strong>View</strong> on any discount to see details, edit or deactivate it.
        </s-paragraph>
        <s-paragraph>
          ⚠️ means the discount expires within 3 days.
        </s-paragraph>
        <s-paragraph>
          Usage count updates every few minutes from Shopify.
        </s-paragraph>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
