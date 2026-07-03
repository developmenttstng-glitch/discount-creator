import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData  = await request.formData();

  const title      = formData.get("title");
  const type       = formData.get("type");
  const value      = formData.get("value");
  const code       = formData.get("code");
  const usageLimit = formData.get("usageLimit");
  const startsAt   = formData.get("startsAt");
  const endsAt     = formData.get("endsAt");
  const oncePerCustomer = formData.get("oncePerCustomer") === "true";

  const discountValue =
    type === "PERCENTAGE"
      ? { percentage: Math.round(parseFloat(value)) / 100 }
      : { amount: { amount: parseFloat(value), currencyCode: "USD" } };

  const response = await admin.graphql(
    `#graphql
    mutation createDiscount($discount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $discount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              codes(first: 1) { nodes { code } }
              usageLimit
              startsAt
              endsAt
            }
          }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        discount: {
          title,
          code: code.toUpperCase(),
          startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
          endsAt:   endsAt   ? new Date(endsAt).toISOString()   : null,
          usageLimit: usageLimit ? parseInt(usageLimit) : null,
          appliesOncePerCustomer: oncePerCustomer,
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
  const errors = json.data?.discountCodeBasicCreate?.userErrors;
  if (errors && errors.length > 0) return { success: false, errors };

  return {
    success: true,
    id: json.data?.discountCodeBasicCreate?.codeDiscountNode?.id,
  };
};

export default function NewDiscount() {
  const fetcher  = useFetcher();
  const shopify  = useAppBridge();
  const navigate = useNavigate();
  const [type, setType] = useState("PERCENTAGE");

  const isLoading = ["loading","submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
const errors    = fetcher.data?.errors || [];

// Show toast and redirect only once using useEffect
useEffect(() => {
  if (fetcher.data?.success && fetcher.data?.id) {
    shopify.toast.show("Discount created!");
    navigate("/app");
  }
}, [fetcher.data]);

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
    outline: "none",
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
    marginTop: 2,
  };

  const row = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 4,
  };

  return (
    <s-page heading="Create Discount">

      {/* Back link */}
      <div style={{ marginBottom: 16 }}>
        <Link to="/app" style={{ fontSize:13, color:"#008060", textDecoration:"none", display:"inline-flex", alignItems:"center", gap:4 }}>
          ← Back to discounts
        </Link>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background:"#fff4f4", border:"1px solid #ffa8a8", borderRadius:8, padding:"14px 18px", marginBottom:16 }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontSize:13, color:"#d82c0d" }}>⚠ {e.message}</div>
          ))}
        </div>
      )}

      <fetcher.Form method="POST">
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, alignItems:"start" }}>

          {/* Left column */}
          <div>

            {/* Basic Info */}
            <div style={sectionStyle}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:"#202223" }}>
                Basic Information
              </div>

              <label style={lbl}>Discount Title *</label>
              <input style={input} name="title" placeholder="e.g. Summer Sale 2025" required/>
              <p style={hint}>Internal name — customers won't see this</p>

              <label style={lbl}>Discount Code *</label>
              <input style={{...input, fontFamily:"monospace", textTransform:"uppercase"}}
                name="code" placeholder="e.g. SUMMER20" required
                onChange={e => e.target.value = e.target.value.toUpperCase()}
              />
              <p style={hint}>Customers enter this at checkout — auto uppercased</p>
            </div>

            {/* Value */}
            <div style={sectionStyle}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:"#202223" }}>
                Discount Value
              </div>

              <div style={row}>
                <div>
                  <label style={lbl}>Type</label>
                  <select style={{...input, marginBottom:0}}
                    name="type" value={type}
                    onChange={e => setType(e.target.value)}>
                    <option value="PERCENTAGE">Percentage Off</option>
                    <option value="FIXED_AMOUNT">Fixed Amount Off</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>
                    {type === "PERCENTAGE" ? "Percentage (%)" : "Amount ($)"} *
                  </label>
                  <input style={{...input, marginBottom:0}}
                    name="value" type="number" min="0"
                    step={type === "PERCENTAGE" ? "1" : "0.01"}
                    placeholder={type === "PERCENTAGE" ? "e.g. 20" : "e.g. 10.00"}
                    required
                  />
                </div>
              </div>
              <p style={{...hint, marginTop:8}}>
                {type === "PERCENTAGE"
                  ? "Enter a number between 1 and 100"
                  : "Enter the fixed dollar amount off the order"}
              </p>
            </div>

            {/* Dates */}
            <div style={sectionStyle}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:"#202223" }}>
                Active Dates
              </div>
              <div style={row}>
                <div>
                  <label style={lbl}>Start Date</label>
                  <input style={{...input, marginBottom:0}} name="startsAt" type="date"/>
                  <p style={hint}>Blank = starts immediately</p>
                </div>
                <div>
                  <label style={lbl}>End Date</label>
                  <input style={{...input, marginBottom:0}} name="endsAt" type="date"/>
                  <p style={hint}>Blank = no expiry</p>
                </div>
              </div>
            </div>

          </div>

          {/* Right column */}
          <div>

            {/* Usage limits */}
            <div style={sectionStyle}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:"#202223" }}>
                Usage Limits
              </div>

              <label style={lbl}>Total Usage Limit</label>
              <input style={input} name="usageLimit" type="number" min="1"
                placeholder="Blank = unlimited"/>
              <p style={hint}>Max times this code can be used in total</p>

              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:8 }}>
                <input type="checkbox" name="oncePerCustomer" value="true"
                  style={{ width:16, height:16 }}/>
                <span style={{ fontSize:13, color:"#202223" }}>Limit to one use per customer</span>
              </label>
            </div>

            {/* Summary box */}
            <div style={{ ...sectionStyle, background:"#f9fafb" }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:12, color:"#202223" }}>
                Summary
              </div>
              <div style={{ fontSize:12, color:"#6d7175", lineHeight:1.8 }}>
                <div>✓ Applies to all products</div>
                <div>✓ Available to all customers</div>
                <div>✓ Works on one-time purchases</div>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={isLoading} style={{
              width: "100%",
              padding: "12px",
              background: isLoading ? "#aaa" : "#008060",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}>
              {isLoading ? "Creating..." : "Create Discount"}
            </button>

            <Link to="/app">
              <button type="button" style={{
                width: "100%",
                padding: "12px",
                background: "#fff",
                color: "#202223",
                border: "1px solid #e1e3e5",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                marginTop: 8,
              }}>
                Cancel
              </button>
            </Link>

          </div>
        </div>
      </fetcher.Form>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
