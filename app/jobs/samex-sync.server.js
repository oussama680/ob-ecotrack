import { unauthenticated } from "../shopify.server.js";
import { CourierManager } from "courier-dz";

const ORDERS_QUERY = `#graphql
  query SamexSyncOrders {
    orders(
      first: 50
      sortKey: CREATED_AT
      reverse: true
    ) {
      edges {
        node {
          id
          name
          tags
        }
      }
    }
  }
`;

const UPDATE_ORDER_TAGS = `#graphql
  mutation SamexSyncOrderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        name
        tags
      }

      userErrors {
        field
        message
      }
    }
  }
`;

function getSamex() {
  const token = process.env.SAMEX_TOKEN;

  if (!token) {
    throw new Error(
      "SAMEX_TOKEN is missing from .env"
    );
  }

  const courier = new CourierManager({
    providers: {
      samex: {
        token,
      },
    },
  });

  return courier.provider("samex");
}

function normalizeStatus(status) {
  const value = String(
    status || "pending"
  )
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  const aliases = {
    created: "pending",
    confirmed: "pending",
    preparation: "pending",
    prepared: "pending",

    picked: "picked_up",
    pickup: "picked_up",

    transit: "in_transit",
    dispatched: "in_transit",

    delivery: "out_for_delivery",

    failed: "failed_delivery",
    delivery_failed: "failed_delivery",

    return: "returning",
    retour: "returning",

    canceled: "cancelled",

    pickup_ready: "ready_for_pickup",

    problem: "exception",
  };

  return aliases[value] || value;
}

function getTracking(tags = []) {
  const tag = tags.find((value) =>
    String(value).startsWith(
      "samex:tracking:"
    )
  );

  if (!tag) {
    return null;
  }

  return String(tag).replace(
    "samex:tracking:",
    ""
  );
}

function buildSamexTags(
  currentTags = [],
  status,
  trackingNumber
) {
  const cleaned =
    currentTags.filter(
      (tag) =>
        !String(tag).startsWith(
          "samex:status:"
        ) &&
        !String(tag).startsWith(
          "samex:tracking:"
        ) &&
        tag !== "samex:sent" &&
        tag !== "samex:not_found"
    );

  const result = [
    ...cleaned,
    "samex:sent",
  ];

  if (status) {
    result.push(
      `samex:status:${normalizeStatus(status)}`
    );
  }

  if (trackingNumber) {
    result.push(
      `samex:tracking:${trackingNumber}`
    );
  }

  return [
    ...new Set(result),
  ];
}

function clearSamexTags(
  currentTags = []
) {
  return currentTags.filter(
    (tag) =>
      !String(tag).startsWith(
        "samex:"
      )
  );
}

function isNotFoundError(error) {
  const message =
    String(
      error?.message || ""
    ).toLowerCase();

  return (
    message.includes(
      "order not found"
    ) ||
    message.includes(
      "shipment not found"
    ) ||
    message.includes(
      "tracking not found"
    ) ||
    message.includes(
      "not found"
    )
  );
}

async function updateTags(
  admin,
  orderId,
  tags
) {
  const response =
    await admin.graphql(
      UPDATE_ORDER_TAGS,
      {
        variables: {
          input: {
            id: orderId,
            tags: [
              ...new Set(tags),
            ],
          },
        },
      }
    );

  const json =
    await response.json();

  const errors =
    json.data?.orderUpdate
      ?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(
      errors
        .map(
          (error) =>
            error.message
        )
        .join("; ")
    );
  }

  return (
    json.data?.orderUpdate
      ?.order?.tags || tags
  );
}

async function getOrders(
  admin
) {
  const response =
    await admin.graphql(
      ORDERS_QUERY
    );

  const json =
    await response.json();

  return (
    json.data?.orders
      ?.edges
      ?.map(
        ({ node }) =>
          node
      ) || []
  );
}

function delay(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

export async function syncSamexForShop(
  shop = process.env.SHOPIFY_SHOP
) {
  if (!shop) {
    throw new Error(
      "SHOPIFY_SHOP is missing from .env"
    );
  }

  const { admin } =
    await unauthenticated.admin(
      shop
    );

  const samex =
    getSamex();

  const orders =
    await getOrders(
      admin
    );

  const summary = {
    selected: 0,
    updated: 0,
    notFound: 0,
    skipped: 0,
    failed: 0,
  };

  const results = {
    updated: [],
    notFound: [],
    skipped: [],
    failed: [],
  };

  for (
    const order of orders
  ) {
    const tracking =
      getTracking(
        order.tags || []
      );

    if (!tracking) {
      continue;
    }

    summary.selected++;

    try {
      let result;

      try {
        result =
          await samex.getOrder(
            tracking
          );
      } catch (
        samexError
      ) {
        if (
          isNotFoundError(
            samexError
          )
        ) {
          await updateTags(
            admin,
            order.id,
            clearSamexTags(
              order.tags || []
            )
          );

          summary.notFound++;

          results.notFound.push({
            orderId:
              order.id,

            orderName:
              order.name,

            oldTracking:
              tracking,
          });

          await delay(
            300
          );

          continue;
        }

        throw samexError;
      }

      const status =
        normalizeStatus(
          result?.status ||
            "pending"
        );

      const currentTracking =
        result?.trackingNumber ||
        result?.tracking ||
        tracking;

      await updateTags(
        admin,
        order.id,
        buildSamexTags(
          order.tags || [],
          status,
          currentTracking
        )
      );

      summary.updated++;

      results.updated.push({
        orderId:
          order.id,

        orderName:
          order.name,

        trackingNumber:
          currentTracking,

        status,
      });

      await delay(
        300
      );
    } catch (error) {
      summary.failed++;

      results.failed.push({
        orderId:
          order.id,

        orderName:
          order.name,

        trackingNumber:
          tracking,

        reason:
          error?.message ||
          "Unknown synchronization error.",
      });
    }
  }

  return {
    ok:
      summary.failed ===
      0,

    summary,

    results,
  };
}

