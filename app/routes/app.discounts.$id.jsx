import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ── Loader: fetch single discount ─────────────────────────────────────────────
export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const id        = decodeURIComponent(params.id);

  const response = await admin.graphql(
    `#graphql
    query getDiscount($id: ID!) {
      codeDiscountNode(id: $id) {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            asyncUsageCount
            usageLimit
            appliesOncePerCustomer
            startsAt
            endsAt
            codes(first: 1) { nodes { code } }
            customerGets {
              value {
                ... on DiscountPercentage { percentage }
                ... on DiscountAmount { amount { amount currencyCode } }
              }
            }
          }
        }
      }
    }`,
    { variables: { id } }
  );

  const json     = await response.json();
  const discount = json.data?.codeDiscountNode;
  if (!discount) throw new Response("Not Found", { status: 404 });
  return { discount };
};

// ── Action: update / deactivate / activate / delete ───────────────────────────
export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const formData  = await request.formData();
  const intent    = formData.get("intent");
  const id        = decodeURIComponent(params.id);

  // ── Delete ──────────────────────────────────────────────────────────────────
  if (intent === "delete") {
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

  // ── Deactivate ──────────────────────────────────────────────────────────────
  if (intent === "deactivate") {
    await admin.graphql(
      `#graphql
      mutation deactivateDiscount($id: ID!) {
        discountCodeDeactivate(id: $id) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      { variables: { id } }
    );
    return { toggled: "deactivated" };
  }

  // ── Activate ────────────────────────────────────────────────────────────────
  if (intent === "activate") {
    await admin.graphql(
      `#graphql
      mutation activateDiscount($id: ID!) {
        discountCodeActivate(id: $id) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      { variables: { id } }
    );
    return { toggled: "activated" };
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  if (intent === "update") {
    const title      = formData.get("title");
    const type       = formData.get("type");
    const value      = formData.get("value");
    const usageLimit = formData.get("usageLimit");
    const endsAt     = formData.get("endsAt");

    const discountValue =
      type === "PERCENTAGE"
        ? { percentage: Math.round(parseFloat(value)) / 100 }
        : { amount: { amount: parseFloat(value), currencyCode: "USD" } };

    const response = await admin.graphql(
      `#graphql
      mutation updateDiscount($id: ID!, $discount: DiscountCodeBasicInput!) {
        discountCodeBasicUpdate(id: $id, basicCodeDiscount: $discount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id,
          discount: {
            title,
            endsAt: endsAt ? new Date(endsAt).toISOString() : null,
            usageLimit: usageLimit ? parseInt(usageLimit) : null,
            customerGets: {
              value: discountValue,
              items: { all: true },
            },
            customerSelection: { all: true },
          },
        },
      }
    );

    const json   = await response.json();
    const errors = json.data?.discountCodeBasicUpdate?.userErrors;
    if (errors && errors.length > 0) return { success: false, errors };
    return { success: true };
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

function getValueType(val) {
  if (!val) return "PERCENTAGE";
  if (val.percentage !== undefined) return "PERCENTAGE";
  return "FIXED_AMOUNT";
}

function getRawValue(val) {
  if (!val) return "";
  if (val.percentage !== undefined) return Math.round(val.percentage * 100);
  if (val.amount) return parseFloat(val.amount.amount).toFixed(2);
  return "";
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
  return new Date(d).toLocaleDateString("en-US", {
    year:"numeric", month:"long", day:"numeric",
    hour:"2-digit", minute:"2-digit",
  });
}

// ── UI ────────────────────────────────────────────────────────────────────────
export default function DiscountDetail() {
  const { discount }   = useLoaderData();
  const fetcher        = useFetcher();
  const shopify        = useAppBridge();
  const navigate       = useNavigate();
  const [editing, setEditing] = useState(false);

  const d      = discount.codeDiscount;
  const code   = d?.codes?.nodes?.[0]?.code || "—";
  const val    = d?.customerGets?.value;
  const status = d?.status || "—";
  const st     = getStatusStyle(status);
  const result = fetcher.data;

  // Handle results
  if (result?.deleted) {
    shopify.toast.show("Discount deleted.");
    navigate("/app");
  }
  if (result?.toggled) {
    shopify.toast.show(result.toggled === "activated" ? "Discount activated." : "Discount deactivated.");
  }
  if (result?.success) {
    shopify.toast.show("Discount updated!");
    setEditing(false);
  }

  const sectionStyle = {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "24px",
    marginBottom: 16,
  };

  const input = {
    width: "100%",
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid #c9cccf",
    borderRadius: 6,
    background: "#fff",
    marginBottom: 4,
    boxSizing: "border-box",
  };

  const lbl = {
    display: "block",
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 600,
    color: "#202223",
  };

  const hint = {
    fontSize: 12,
    color: "#6d7175",
    marginBottom: 16,
  };

  const infoRow = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #f1f2f3",
    fontSize: 13,
  };

  const infoLabel = { color:"#6d7175", fontWeight:500 };
  const infoValue = { color:"#202223", fontWeight:600, textAlign:"right" };

  const isLoading = ["loading","submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";

  return (
    <s-page heading={d?.title || "Discount Detail"}>

      {/* Back */}
      <div style={{ marginBottom:16 }}>
        <Link to="/app" style={{ fontSize:13, color:"#008060", textDecoration:"none" }}>
          ← Back to discounts
        </Link>
      </div>

      {/* Error banner */}
      {result?.errors?.length > 0 && (
        <div style={{ background:"#fff4f4", border:"1px solid #ffa8a8", borderRadius:8, padding:"14px 18px", marginBottom:16 }}>
          {result.errors.map((e, i) => (
            <div key={i} style={{ fontSize:13, color:"#d82c0d" }}>⚠ {e.message}</div>
          ))}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, alignItems:"start" }}>

        {/* Left — Info + Edit */}
        <div>

          {/* Discount info */}
          <div style={sectionStyle}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#202223" }}>Discount Details</div>
              <span style={{
                padding:"4px 12px", borderRadius:12, fontSize:12,
                fontWeight:700, background:st.bg, color:st.color,
              }}>
                {status}
              </span>
            </div>

            <div style={infoRow}>
              <span style={infoLabel}>Discount Code</span>
              <span style={{ ...infoValue, fontFamily:"monospace", fontSize:15, background:"#f1f2f3", padding:"2px 10px", borderRadius:4 }}>
                {code}
              </span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>Value</span>
              <span style={{ ...infoValue, color:"#008060" }}>{getValueLabel(val)}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>Times Used</span>
              <span style={infoValue}>{d?.asyncUsageCount ?? 0} {d?.usageLimit ? `/ ${d.usageLimit}` : "/ Unlimited"}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>One Use Per Customer</span>
              <span style={infoValue}>{d?.appliesOncePerCustomer ? "Yes" : "No"}</span>
            </div>
            <div style={infoRow}>
              <span style={infoLabel}>Start Date</span>
              <span style={infoValue}>{formatDate(d?.startsAt)}</span>
            </div>
            <div style={{ ...infoRow, borderBottom:"none" }}>
              <span style={infoLabel}>End Date</span>
              <span style={infoValue}>{formatDate(d?.endsAt)}</span>
            </div>
          </div>

          {/* Edit form */}
          {editing ? (
            <div style={sectionStyle}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:"#202223" }}>
                Edit Discount
              </div>
              <fetcher.Form method="POST">
                <input type="hidden" name="intent" value="update"/>

                <label style={lbl}>Title</label>
                <input style={input} name="title" defaultValue={d?.title}/>
                <p style={hint}>Internal name</p>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div>
                    <label style={lbl}>Type</label>
                    <select style={{...input}} name="type" defaultValue={getValueType(val)}>
                      <option value="PERCENTAGE">Percentage Off</option>
                      <option value="FIXED_AMOUNT">Fixed Amount Off</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Value</label>
                    <input style={input} name="value" type="number" min="0" step="0.01"
                      defaultValue={getRawValue(val)}/>
                  </div>
                </div>

                <label style={lbl}>Usage Limit</label>
                <input style={input} name="usageLimit" type="number" min="1"
                  defaultValue={d?.usageLimit || ""}
                  placeholder="Blank = unlimited"/>
                <p style={hint}>Leave blank for unlimited uses</p>

                <label style={lbl}>End Date</label>
                <input style={input} name="endsAt" type="date"
                  defaultValue={d?.endsAt ? d.endsAt.split("T")[0] : ""}/>
                <p style={hint}>Leave blank for no expiry</p>

                <div style={{ display:"flex", gap:8 }}>
                  <button type="submit" disabled={isLoading} style={{
                    flex:1, padding:"10px", background: isLoading ? "#aaa" : "#008060",
                    color:"#fff", border:"none", borderRadius:6,
                    fontSize:13, fontWeight:700, cursor: isLoading ? "not-allowed" : "pointer",
                  }}>
                    {isLoading ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} style={{
                    flex:1, padding:"10px", background:"#fff",
                    color:"#202223", border:"1px solid #e1e3e5", borderRadius:6,
                    fontSize:13, fontWeight:600, cursor:"pointer",
                  }}>
                    Cancel
                  </button>
                </div>
              </fetcher.Form>
            </div>
          ) : null}

        </div>

        {/* Right — Actions */}
        <div>
          <div style={sectionStyle}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:"#202223" }}>
              Actions
            </div>

            {/* Edit */}
            <button onClick={() => setEditing(e => !e)} style={{
              width:"100%", padding:"10px", background:"#f1f2f3",
              color:"#202223", border:"1px solid #e1e3e5", borderRadius:6,
              fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:8,
            }}>
              {editing ? "Cancel Edit" : "✏️ Edit Discount"}
            </button>

            {/* Activate / Deactivate */}
            <fetcher.Form method="POST">
              <input type="hidden" name="intent" value={status === "ACTIVE" ? "deactivate" : "activate"}/>
              <button type="submit" style={{
                width:"100%", padding:"10px",
                background: status === "ACTIVE" ? "#fff3cd" : "#d4edda",
                color:      status === "ACTIVE" ? "#856404" : "#155724",
                border:`1px solid ${status === "ACTIVE" ? "#ffc107" : "#28a745"}`,
                borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:8,
              }}>
                {status === "ACTIVE" ? "⏸ Deactivate" : "▶ Activate"}
              </button>
            </fetcher.Form>

            {/* Delete */}
            <fetcher.Form method="POST"
              onSubmit={e => { if (!confirm("Delete this discount? This cannot be undone.")) e.preventDefault() }}>
              <input type="hidden" name="intent" value="delete"/>
              <button type="submit" style={{
                width:"100%", padding:"10px", background:"#fff",
                color:"#d82c0d", border:"1px solid #d82c0d", borderRadius:6,
                fontSize:13, fontWeight:600, cursor:"pointer",
              }}>
                🗑 Delete Discount
              </button>
            </fetcher.Form>
          </div>

          {/* Usage progress */}
          {d?.usageLimit && (
            <div style={sectionStyle}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"#202223" }}>
                Usage
              </div>
              <div style={{ fontSize:12, color:"#6d7175", marginBottom:6 }}>
                {d.asyncUsageCount} of {d.usageLimit} uses
              </div>
              <div style={{ background:"#e1e3e5", borderRadius:4, height:8, overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:4,
                  background: d.asyncUsageCount / d.usageLimit > 0.8 ? "#d82c0d" : "#008060",
                  width: `${Math.min(100, (d.asyncUsageCount / d.usageLimit) * 100)}%`,
                  transition:"width 0.3s",
                }}/>
              </div>
              {d.asyncUsageCount / d.usageLimit > 0.8 && (
                <div style={{ fontSize:11, color:"#d82c0d", marginTop:4 }}>
                  ⚠️ Almost at usage limit
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
