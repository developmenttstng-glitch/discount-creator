import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ── Loader: fetch existing discounts on page load ─────────────────────────────
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getDiscounts {
      codeDiscountNodes(first: 20) {
        nodes {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              codes(first: 1) {
                nodes { code }
              }
              usageLimit
              startsAt
              endsAt
              customerGets {
                value {
                  ... on DiscountPercentage {
                    percentage
                  }
                  ... on DiscountAmount {
                    amount { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }`
  );

  const json = await response.json();
  const discounts = json.data?.codeDiscountNodes?.nodes || [];
  return { discounts };
};

// ── Action: create or delete a discount ───────────────────────────────────────
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData  = await request.formData();
  const intent    = formData.get("intent");

  // ── Delete ──────────────────────────────────────────────────────────────────
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

  // ── Create ──────────────────────────────────────────────────────────────────
  const title      = formData.get("title");
  const type       = formData.get("type");
  const value      = formData.get("value");
  const code       = formData.get("code");
  const usageLimit = formData.get("usageLimit");
  const startsAt   = formData.get("startsAt");
  const endsAt     = formData.get("endsAt");

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
              customerGets {
                value {
                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount currencyCode } }
                }
              }
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
          code,
          startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
          endsAt:   endsAt   ? new Date(endsAt).toISOString()   : null,
          usageLimit: usageLimit ? parseInt(usageLimit) : null,
          appliesOncePerCustomer: false,
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
    discount: json.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount,
  };
};

// ── UI ────────────────────────────────────────────────────────────────────────
export default function DiscountCreator() {
  const fetcher          = useFetcher();
  const shopify          = useAppBridge();
  const { discounts }    = useLoaderData();
  const [type, setType]  = useState("PERCENTAGE");

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const result   = fetcher.data;
  const success  = result?.success;
  const errors   = result?.errors || [];
  const discount = result?.discount;

  if (success && discount) shopify.toast.show("Discount created!");
  if (result?.deleted)     shopify.toast.show("Discount deleted.");

  const input = {
    width: "100%", padding: "8px 12px", fontSize: 14,
    border: "1px solid #c9cccf", borderRadius: 4,
    background: "#fff", marginBottom: 16, boxSizing: "border-box",
  };
  const lbl = {
    display: "block", marginBottom: 4,
    fontSize: 14, fontWeight: 500, color: "#202223",
  };
  const hint = {
    fontSize: 12, color: "#6d7175", marginTop: -12, marginBottom: 16,
  };

  return (
    <s-page heading="Discount Creator">

      {/* Banners */}
      {success && discount && (
        <s-banner tone="success">
          <s-paragraph>
            ✓ Code <strong>{discount.codes?.nodes?.[0]?.code}</strong> created!
          </s-paragraph>
        </s-banner>
      )}
      {result?.deleted && (
        <s-banner tone="success">
          <s-paragraph>✓ Discount deleted.</s-paragraph>
        </s-banner>
      )}
      {errors.length > 0 && (
        <s-banner tone="critical">
          {errors.map((e, i) => <s-paragraph key={i}>⚠ {e.message}</s-paragraph>)}
        </s-banner>
      )}

      {/* Create form */}
      <s-section heading="Create a Discount Code">
        <fetcher.Form method="POST">
          <label style={lbl}>Discount Title *</label>
          <input style={input} name="title" placeholder="e.g. Summer Sale" required/>

          <label style={lbl}>Discount Code *</label>
          <input style={input} name="code" placeholder="e.g. SUMMER20" required/>
          <p style={hint}>Customers enter this at checkout</p>

          <label style={lbl}>Discount Type</label>
          <select style={input} name="type" value={type} onChange={e => setType(e.target.value)}>
            <option value="PERCENTAGE">Percentage Off</option>
            <option value="FIXED_AMOUNT">Fixed Amount Off</option>
          </select>

          <label style={lbl}>{type === "PERCENTAGE" ? "Percentage Off (%)" : "Amount Off ($)"} *</label>
          <input style={input} name="value" type="number" min="0"
            step={type === "PERCENTAGE" ? "1" : "0.01"}
            placeholder={type === "PERCENTAGE" ? "e.g. 20" : "e.g. 10.00"} required/>
          <p style={hint}>{type === "PERCENTAGE" ? "Enter 1–100" : "Enter the fixed amount"}</p>

          <label style={lbl}>Usage Limit</label>
          <input style={input} name="usageLimit" type="number" min="1" placeholder="Blank = unlimited"/>
          <p style={hint}>Maximum total uses across all customers</p>

          <label style={lbl}>Start Date</label>
          <input style={input} name="startsAt" type="date"/>
          <p style={hint}>Blank = start immediately</p>

          <label style={lbl}>End Date</label>
          <input style={input} name="endsAt" type="date"/>
          <p style={hint}>Blank = no expiry</p>

          <button type="submit" disabled={isLoading} style={{
            padding: "10px 24px", background: isLoading ? "#aaa" : "#008060",
            color: "#fff", border: "none", borderRadius: 4,
            fontSize: 14, fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer", width: "100%",
          }}>
            {isLoading ? "Creating..." : "Create Discount"}
          </button>
        </fetcher.Form>
      </s-section>

      {/* API response after create */}
      {success && discount && (
        <s-section heading="API Response">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ margin:0, fontSize:12, overflowX:"auto" }}>
              <code>{JSON.stringify(discount, null, 2)}</code>
            </pre>
          </s-box>
        </s-section>
      )}

      {/* Existing discounts table */}
      <s-section heading={`Existing Discounts (${discounts.length})`}>
        {discounts.length === 0 ? (
          <s-paragraph>No discounts found.</s-paragraph>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"2px solid #e1e3e5", textAlign:"left" }}>
                <th style={{ padding:"8px 12px" }}>Code</th>
                <th style={{ padding:"8px 12px" }}>Title</th>
                <th style={{ padding:"8px 12px" }}>Value</th>
                <th style={{ padding:"8px 12px" }}>Status</th>
                <th style={{ padding:"8px 12px" }}>Usage Limit</th>
                <th style={{ padding:"8px 12px" }}>Ends</th>
                <th style={{ padding:"8px 12px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((node) => {
                const d          = node.codeDiscount;
                const code       = d?.codes?.nodes?.[0]?.code || "—";
                const val        = d?.customerGets?.value;
                const valueLabel = val?.percentage
                  ? `${Math.round(val.percentage * 100)}% off`
                  : val?.amount
                  ? `${val.amount.currencyCode} ${val.amount.amount} off`
                  : "—";

                return (
                  <tr key={node.id} style={{ borderBottom:"1px solid #e1e3e5" }}>
                    <td style={{ padding:"10px 12px", fontWeight:600 }}>{code}</td>
                    <td style={{ padding:"10px 12px" }}>{d?.title || "—"}</td>
                    <td style={{ padding:"10px 12px" }}>{valueLabel}</td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{
                        padding:"2px 8px", borderRadius:12, fontSize:11,
                        background: d?.status === "ACTIVE" ? "#d4edda" : "#f8d7da",
                        color:      d?.status === "ACTIVE" ? "#155724" : "#721c24",
                      }}>
                        {d?.status || "—"}
                      </span>
                    </td>
                    <td style={{ padding:"10px 12px" }}>{d?.usageLimit ?? "Unlimited"}</td>
                    <td style={{ padding:"10px 12px" }}>
                      {d?.endsAt ? new Date(d.endsAt).toLocaleDateString() : "No expiry"}
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      <fetcher.Form method="POST">
                        <input type="hidden" name="intent" value="delete"/>
                        <input type="hidden" name="id" value={node.id}/>
                        <button type="submit" style={{
                          padding:"4px 12px", background:"#d82c0d",
                          color:"#fff", border:"none", borderRadius:4,
                          fontSize:12, cursor:"pointer",
                        }}>
                          Delete
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          Create percentage or fixed amount discount codes via the Admin GraphQL API.
        </s-paragraph>
        <s-paragraph>
          Discounts apply to all products and all customers by default.
        </s-paragraph>
        <s-paragraph>
          Check <strong>Shopify Admin → Discounts</strong> to see them live.
        </s-paragraph>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};