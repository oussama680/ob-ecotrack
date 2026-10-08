/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable react/prop-types */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable no-irregular-whitespace */

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";

import { useAppBridge } from "@shopify/app-bridge-react";

import {
  CourierManager,
  CreateOrderData,
} from "courier-dz";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

/* =========================================================
   SHOPIFY GRAPHQL
   ========================================================= */

const ORDERS_QUERY = `#graphql
  query GetOrders {
    orders(
      first: 50
      sortKey: CREATED_AT
      reverse: true
    ) {
      edges {
        node {
          id
          name
          createdAt
          tags

          displayFinancialStatus
          displayFulfillmentStatus

          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }

          shippingAddress {
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            zip
            phone
            countryCode
          }

          customAttributes {
            key
            value
          }

          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

const ORDER_QUERY = `#graphql
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      tags

      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }

      shippingAddress {
        name
        firstName
        lastName
        address1
        address2
        city
        province
        provinceCode
        zip
        phone
        countryCode
      }

      customAttributes {
        key
        value
      }

      lineItems(first: 50) {
        edges {
          node {
            title
            quantity
          }
        }
      }
    }
  }
`;

const UPDATE_ORDER_TAGS = `#graphql
  mutation OrderUpdate($input: OrderInput!) {
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

const UPDATE_ORDER_REVIEW = `#graphql
  mutation OrderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        name
        tags

        shippingAddress {
          firstName
          lastName
          address1
          city
          provinceCode
          zip
          phone
          countryCode
        }

        customAttributes {
          key
          value
        }
      }

      userErrors {
        field
        message
      }
    }
  }
`;

/* =========================================================
   SAMEX
   ========================================================= */

function getSamex() {
  const token =
    process.env.SAMEX_TOKEN;

  if (!token) {
    throw new Error(
      "SAMEX_TOKEN is missing from .env"
    );
  }

  const courier =
    new CourierManager({
      providers: {
        samex: {
          token,
        },
      },
    });

  return courier.provider(
    "samex"
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function normalizePhone(phone) {
  if (!phone) {
    return "";
  }

  let value =
    String(phone)
      .trim()
      .replace(/[^\d+]/g, "");

  if (
    value.startsWith(
      "+213"
    )
  ) {
    value =
      "0" +
      value.slice(4);
  }

  if (
    value.startsWith(
      "213"
    )
  ) {
    value =
      "0" +
      value.slice(3);
  }

  return value;
}

function toE164Phone(phone) {
  const local =
    normalizePhone(
      phone
    );

  if (
    /^0[5-7]\d{8}$/.test(
      local
    )
  ) {
    return (
      "+213" +
      local.slice(1)
    );
  }

  return phone || "";
}

function getCustomAttribute(
  attributes,
  keys
) {
  const wanted =
    keys.map(
      normalizeKey
    );

  const found =
    (
      attributes || []
    ).find(
      (attribute) =>
        wanted.includes(
          normalizeKey(
            attribute.key
          )
        )
    );

  return (
    found?.value?.trim() ||
    ""
  );
}

function parseStopDesk(
  value
) {
  if (!value) {
    return false;
  }

  return [
    "true",
    "1",
    "yes",
    "oui",
    "stopdesk",
    "stop desk",
  ].includes(
    normalizeKey(
      value
    )
  );
}

function getProvinceId(
  value
) {
  if (!value) {
    return "";
  }

  const digits =
    String(value)
      .trim()
      .replace(
        /[^\d]/g,
        ""
      );

  if (!digits) {
    return "";
  }

  const id =
    Number(digits);

  if (
    !Number.isInteger(
      id
    ) ||
    id < 1 ||
    id > 58
  ) {
    return "";
  }

  return String(id);
}

/* =========================================================
   WEBI DATA
   ========================================================= */

function extractWebiData(
  order
) {
  const attributes =
    order.customAttributes ||
    [];

  const shipping =
    order.shippingAddress;

  const firstName =
    getCustomAttribute(
      attributes,
      [
        "First Name",
        "firstname",
        "first_name",
      ]
    );

  const lastName =
    getCustomAttribute(
      attributes,
      [
        "Last Name",
        "lastname",
        "last_name",
      ]
    );

  const phone =
    getCustomAttribute(
      attributes,
      [
        "Phone",
        "Telephone",
        "Téléphone",
      ]
    );

  const address =
    getCustomAttribute(
      attributes,
      [
        "Address",
        "Adresse",
      ]
    );

  const city =
    getCustomAttribute(
      attributes,
      [
        "City",
        "Ville",
      ]
    );

  const commune =
    getCustomAttribute(
      attributes,
      [
        "Commune",
      ]
    );

  const province =
    getCustomAttribute(
      attributes,
      [
        "Province",
        "Wilaya",
      ]
    );

  const provinceCode =
    getCustomAttribute(
      attributes,
      [
        "Province Code",
        "Wilaya Code",
        "WilayaCode",
        "province_code",
      ]
    );

  const stopDesk =
    getCustomAttribute(
      attributes,
      [
        "StopDesk",
        "Stop Desk",
      ]
    );

  const fallbackName =
    shipping?.name ||
    "Guest";

  const parts =
    fallbackName.split(
      /\s+/
    );

  const fallbackFirst =
    parts.shift() ||
    "Client";

  const fallbackLast =
    parts.join(" ");

  return {
    firstName:
      firstName ||
      shipping?.firstName ||
      fallbackFirst,

    lastName:
      lastName ||
      shipping?.lastName ||
      fallbackLast,

    phone:
      normalizePhone(
        phone ||
          shipping?.phone ||
          ""
      ),

    address:
      address ||
      shipping?.address1 ||
      "",

    city:
      city ||
      shipping?.city ||
      "",

    commune:
      commune ||
      shipping?.city ||
      "",

    province:
      province ||
      shipping?.province ||
      "",

    provinceCode:
      getProvinceId(
        provinceCode ||
          shipping?.provinceCode ||
          ""
      ),

    stopDesk:
      parseStopDesk(
        stopDesk
      ),
  };
}

/* =========================================================
   PRODUCT
   ========================================================= */

function getProductDescription(
  order
) {
  return (
    order.lineItems?.edges
      ?.map(
        ({ node }) =>
          `${node.title} x${node.quantity}`
      )
      .join(", ")
      .slice(0, 255) ||
    "Shopify Order"
  );
}

/* =========================================================
   SAME X TAGS
   ========================================================= */

function getSamexTracking(
  tags = []
) {
  const tag =
    tags.find(
      (value) =>
        String(value).startsWith(
          "samex:tracking:"
        )
    );

  if (!tag) {
    return null;
  }

  return String(
    tag
  ).replace(
    "samex:tracking:",
    ""
  );
}

function getSamexStatus(
  tags = []
) {
  const tag =
    tags.find(
      (value) =>
        String(value).startsWith(
          "samex:status:"
        )
    );

  if (!tag) {
    return null;
  }

  return String(
    tag
  ).replace(
    "samex:status:",
    ""
  );
}

function isAlreadySent(
  tags = []
) {
  return (
    tags.includes(
      "samex:sent"
    ) ||
    Boolean(
      getSamexTracking(
        tags
      )
    )
  );
}

function isNotFoundError(
  error
) {
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

function buildSamexTags(
  currentTags = [],
  status = null,
  trackingNumber = null
) {
  const cleaned =
    currentTags.filter(
      (tag) =>
        !String(
          tag
        ).startsWith(
          "samex:"
        )
    );

  const result = [
    ...cleaned,
    "samex:sent",
  ];

  if (status) {
    result.push(
      `samex:status:${status}`
    );
  }

  if (trackingNumber) {
    result.push(
      `samex:tracking:${trackingNumber}`
    );
  }

  return [
    ...new Set(
      result
    ),
  ];
}

function clearSamexTags(
  tags = []
) {
  return tags.filter(
    (tag) =>
      !String(
        tag
      ).startsWith(
        "samex:"
      )
  );
}

/* =========================================================
   SHOPIFY TAG UPDATE
   ========================================================= */

async function updateOrderTags({
  admin,
  orderId,
  tags,
}) {
  const response =
    await admin.graphql(
      UPDATE_ORDER_TAGS,
      {
        variables: {
          input: {
            id: orderId,
            tags,
          },
        },
      }
    );

  const json =
    await response.json();

  const errors =
    json.data
      ?.orderUpdate
      ?.userErrors ||
    [];

  return {
    errors,

    tags:
      json.data
        ?.orderUpdate
        ?.order
        ?.tags ||
      tags,
  };
}

async function saveSamexStatus({
  admin,
  order,
  status,
  trackingNumber,
}) {
  const tags =
    buildSamexTags(
      order.tags || [],
      status,
      trackingNumber
    );

  return updateOrderTags({
    admin,

    orderId:
      order.id,

    tags,
  });
}

async function clearSamexState({
  admin,
  order,
}) {
  return updateOrderTags({
    admin,

    orderId:
      order.id,

    tags:
      clearSamexTags(
        order.tags || []
      ),
  });
}

/* =========================================================
   GET SHOPIFY ORDER
   ========================================================= */

async function getShopifyOrder(
  admin,
  orderId
) {
  const response =
    await admin.graphql(
      ORDER_QUERY,
      {
        variables: {
          id:
            orderId,
        },
      }
    );

  const json =
    await response.json();

  return (
    json.data?.order ||
    null
  );
}

/* =========================================================
   FIND COMMUNE
   ========================================================= */

function findCommune(
  communes,
  communeName
) {
  if (!communeName) {
    return null;
  }

  const wanted =
    normalizeText(
      communeName
    );

  return (
    communes.find(
      (item) =>
        normalizeText(
          item?.name
        ) === wanted
    ) || null
  );
}

/* =========================================================
   UPDATE REVIEW ATTRIBUTES
   ========================================================= */

function replaceCustomAttribute(
  attributes,
  keys,
  value
) {
  const wanted =
    keys.map(
      normalizeKey
    );

  return attributes
    .filter(
      (attribute) =>
        !wanted.includes(
          normalizeKey(
            attribute.key
          )
        )
    )
    .concat({
      key:
        keys[0],

      value:
        String(
          value ?? ""
        ),
    });
}

function buildUpdatedCustomAttributes({
  current,
  firstName,
  lastName,
  phone,
  address,
  city,
  commune,
  province,
  provinceCode,
  stopDesk,
}) {
  let attributes =
    Array.isArray(current)
      ? [...current]
      : [];

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "First Name",
        "firstname",
        "first_name",
      ],
      firstName
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "Last Name",
        "lastname",
        "last_name",
      ],
      lastName
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "Phone",
        "Telephone",
        "Téléphone",
      ],
      phone
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "Address",
        "Adresse",
      ],
      address
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "City",
        "Ville",
      ],
      city
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "Commune",
      ],
      commune
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "Province",
        "Wilaya",
      ],
      province
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "Province Code",
        "Wilaya Code",
        "WilayaCode",
        "province_code",
      ],
      provinceCode
    );

  attributes =
    replaceCustomAttribute(
      attributes,
      [
        "StopDesk",
        "Stop Desk",
      ],
      stopDesk
        ? "true"
        : "false"
    );

  return attributes;
}

/* =========================================================
   LOADER
   ========================================================= */

export const loader =
  async ({
    request,
  }) => {
    const { admin } =
      await authenticate.admin(
        request
      );

    const response =
      await admin.graphql(
        ORDERS_QUERY
      );

    const json =
      await response.json();

    let wilayas = [];

    try {
      const samex =
        getSamex();

      wilayas =
        (await samex.getWilayas()) ||
        [];
    } catch (error) {
      console.error(
        "Samex wilayas error:",
        error
      );
    }

    return {
      orders:
        json.data
          ?.orders
          ?.edges
          ?.map(
            ({ node }) =>
              node
          ) || [],

      wilayas,
    };
  };

/* =========================================================
   ACTION
   ========================================================= */

export const action =
  async ({
    request,
  }) => {
    const { admin } =
      await authenticate.admin(
        request
      );

    const formData =
      await request.formData();

    const intent =
      String(
        formData.get(
          "intent"
        ) || ""
      );

    /* =====================================================
       TEST CONNECTION
       ===================================================== */

    if (
      intent ===
      "test_connection"
    ) {
      try {
        const samex =
          getSamex();

        const valid =
          await samex.testCredentials();

        return {
          ok: valid,

          type:
            "connection",

          message:
            valid
              ? "Samex API connection successful."
              : "Samex API token was rejected.",
        };
      } catch (error) {
        return {
          ok: false,

          type:
            "connection",

          message:
            error?.message ||
            "Samex connection failed.",
        };
      }
    }

    /* =====================================================
       GET COMMUNES
       ===================================================== */

    if (
      intent ===
      "get_communes"
    ) {
      const wilayaId =
        Number(
          formData.get(
            "wilayaId"
          ) || 0
        );

      if (
        !Number.isInteger(
          wilayaId
        ) ||
        wilayaId < 1 ||
        wilayaId > 58
      ) {
        return {
          ok: false,
          type:
            "communes",
          communes: [],
          message:
            "Invalid Wilaya ID.",
        };
      }

      try {
        const samex =
          getSamex();

        const communes =
          (await samex.getCommunes(
            wilayaId
          )) || [];

        return {
          ok: true,

          type:
            "communes",

          communes,
        };
      } catch (error) {
        return {
          ok: false,

          type:
            "communes",

          communes: [],

          message:
            error?.message ||
            "Could not load communes.",
        };
      }
    }

    /* =====================================================
       SAVE REVIEW
       ===================================================== */

    if (
      intent ===
      "save_review"
    ) {
      const orderId =
        String(
          formData.get(
            "orderId"
          ) || ""
        ).trim();

      const firstName =
        String(
          formData.get(
            "firstName"
          ) || ""
        ).trim();

      const lastName =
        String(
          formData.get(
            "lastName"
          ) || ""
        ).trim();

      const phone =
        normalizePhone(
          String(
            formData.get(
              "phone"
            ) || ""
          )
        );

      const address =
        String(
          formData.get(
            "address"
          ) || ""
        ).trim();

      const wilayaId =
        Number(
          formData.get(
            "wilayaId"
          ) || 0
        );

      const wilayaName =
        String(
          formData.get(
            "wilayaName"
          ) || ""
        ).trim();

      const commune =
        String(
          formData.get(
            "commune"
          ) || ""
        ).trim();

      const stopDesk =
        String(
          formData.get(
            "stopDesk"
          ) || "false"
        ) ===
        "true";

      try {
        if (!orderId) {
          throw new Error(
            "Missing Shopify order ID."
          );
        }

        if (!firstName) {
          throw new Error(
            "First name is required."
          );
        }

        if (
          !/^0[5-7]\d{8}$/.test(
            phone
          )
        ) {
          throw new Error(
            `Invalid Algerian phone number: ${phone}`
          );
        }

        if (!address) {
          throw new Error(
            "Address is required."
          );
        }

        if (
          !Number.isInteger(
            wilayaId
          ) ||
          wilayaId < 1 ||
          wilayaId > 58
        ) {
          throw new Error(
            "Please select a valid Wilaya."
          );
        }

        if (!wilayaName) {
          throw new Error(
            "Wilaya name is required."
          );
        }

        if (!commune) {
          throw new Error(
            "Please select a Commune."
          );
        }

        const samex =
          getSamex();

        const communes =
          (await samex.getCommunes(
            wilayaId
          )) || [];

        const communeMatch =
          findCommune(
            communes,
            commune
          );

        if (!communeMatch) {
          throw new Error(
            `Commune "${commune}" was not found in Samex for Wilaya ${wilayaId}.`
          );
        }

        const order =
          await getShopifyOrder(
            admin,
            orderId
          );

        if (!order) {
          throw new Error(
            "Shopify order not found."
          );
        }

        const updatedAttributes =
          buildUpdatedCustomAttributes({
            current:
              order.customAttributes ||
              [],

            firstName,
            lastName,
            phone,
            address,

            city:
              communeMatch.name,

            commune:
              communeMatch.name,

            province:
              wilayaName,

            provinceCode:
              String(
                wilayaId
              ),

            stopDesk,
          });

        const response =
          await admin.graphql(
            UPDATE_ORDER_REVIEW,
            {
              variables: {
                input: {
                  id:
                    order.id,

                  customAttributes:
                    updatedAttributes,

                  phone:
                    toE164Phone(
                      phone
                    ),

                  shippingAddress: {
                    firstName,
                    lastName,

                    address1:
                      address,

                    city:
                      communeMatch.name,

                    provinceCode:
                      String(
                        wilayaId
                      ),

                    phone:
                      toE164Phone(
                        phone
                      ),

                    countryCode:
                      "DZ",
                  },
                },
              },
            }
          );

        const json =
          await response.json();

        const errors =
          json.data
            ?.orderUpdate
            ?.userErrors ||
          [];

        if (
          errors.length
        ) {
          throw new Error(
            errors
              .map(
                (error) =>
                  error.message
              )
              .join("; ")
          );
        }

        return {
          ok: true,

          type:
            "review_saved",

          message:
            "Order updated successfully. It is now ready.",

          orderId:
            order.name,
        };
      } catch (error) {
        return {
          ok: false,

          type:
            "review_saved",

          message:
            error?.message ||
            "Could not save order.",
        };
      }
    }

    /* =====================================================
       SYNC SINGLE
       ===================================================== */

    if (
      intent ===
      "sync_status"
    ) {
      const orderId =
        String(
          formData.get(
            "orderId"
          ) || ""
        ).trim();

      try {
        const order =
          await getShopifyOrder(
            admin,
            orderId
          );

        if (!order) {
          return {
            ok: false,

            type:
              "sync_status",

            message:
              "Shopify order not found.",
          };
        }

        const tracking =
          getSamexTracking(
            order.tags || []
          );

        if (!tracking) {
          return {
            ok: false,

            type:
              "sync_status",

            message:
              "No Samex tracking number found.",
          };
        }

        const samex =
          getSamex();

        try {
          const result =
            await samex.getOrder(
              tracking
            );

          const status =
            result?.status ||
            "unknown";

          const currentTracking =
            result?.trackingNumber ||
            result?.tracking ||
            tracking;

          const saved =
            await saveSamexStatus({
              admin,
              order,

              status,

              trackingNumber:
                currentTracking,
            });

          return {
            ok: true,

            type:
              "sync_status",

            message:
              "Samex status synchronized.",

            trackingNumber:
              currentTracking,

            status,

            savedToShopify:
              saved.errors
                .length ===
              0,
          };
        } catch (
          samexError
        ) {
          if (
            isNotFoundError(
              samexError
            )
          ) {
            const cleared =
              await clearSamexState({
                admin,
                order,
              });

            return {
              ok: false,

              type:
                "not_found",

              message:
                "Samex shipment no longer exists. Old Samex data was cleared.",

              oldTracking:
                tracking,

              cleared:
                cleared.errors
                  .length ===
                0,
            };
          }

          throw samexError;
        }
      } catch (error) {
        return {
          ok: false,

          type:
            "sync_status",

          message:
            error?.message ||
            "Could not synchronize Samex status.",
        };
      }
    }

    /* =====================================================
       BULK SYNC
       ===================================================== */

    if (
      intent ===
      "bulk_sync"
    ) {
      const results = {
        updated: [],
        notFound: [],
        skipped: [],
        failed: [],
      };

      let selectedIds = [];

      const rawOrderIds =
        String(
          formData.get(
            "orderIds"
          ) || ""
        ).trim();

      if (rawOrderIds) {
        try {
          selectedIds =
            JSON.parse(
              rawOrderIds
            );
        } catch {
          return {
            ok: false,

            type:
              "bulk_sync_result",

            message:
              "Invalid order selection.",
          };
        }
      }

      /*
        If no selection was supplied,
        sync every sent order currently
        visible in the latest Shopify query.
      */

      if (
        !Array.isArray(
          selectedIds
        ) ||
        selectedIds.length ===
          0
      ) {
        const listResponse =
          await admin.graphql(
            ORDERS_QUERY
          );

        const listJson =
          await listResponse.json();

        selectedIds =
          listJson.data
            ?.orders
            ?.edges
            ?.map(
              ({
                node,
              }) => node
            )
            ?.filter(
              (order) =>
                isAlreadySent(
                  order.tags ||
                    []
                )
            )
            ?.map(
              (order) =>
                order.id
            ) || [];
      }

      selectedIds = [
        ...new Set(
          selectedIds
            .filter(Boolean)
            .slice(0, 50)
        ),
      ];

      if (
        selectedIds.length ===
        0
      ) {
        return {
          ok: true,

          type:
            "bulk_sync_result",

          message:
            "No Samex shipments found to synchronize.",

          summary: {
            selected: 0,
            updated: 0,
            notFound: 0,
            skipped: 0,
            failed: 0,
          },

          results,
        };
      }

      let samex;

      try {
        samex =
          getSamex();
      } catch (error) {
        return {
          ok: false,

          type:
            "bulk_sync_result",

          message:
            error?.message ||
            "Samex connection failed.",

          summary: {
            selected:
              selectedIds.length,

            updated: 0,
            notFound: 0,
            skipped: 0,
            failed:
              selectedIds.length,
          },

          results,
        };
      }

      /*
        Sequential processing:
        one Samex status request at a time.
      */

      for (
        const orderId of
        selectedIds
      ) {
        try {
          const order =
            await getShopifyOrder(
              admin,
              orderId
            );

          if (!order) {
            results.failed.push({
              orderId,

              orderName:
                orderId,

              reason:
                "Shopify order not found.",
            });

            continue;
          }

          const tracking =
            getSamexTracking(
              order.tags || []
            );

          if (!tracking) {
            results.skipped.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "No Samex tracking number.",
            });

            continue;
          }

          try {
            const result =
              await samex.getOrder(
                tracking
              );

            const status =
              result?.status ||
              "unknown";

            const currentTracking =
              result?.trackingNumber ||
              result?.tracking ||
              tracking;

            const saved =
              await saveSamexStatus({
                admin,

                order,

                status,

                trackingNumber:
                  currentTracking,
              });

            if (
              saved.errors.length >
              0
            ) {
              results.failed.push({
                orderId:
                  order.id,

                orderName:
                  order.name,

                reason:
                  saved.errors
                    .map(
                      (
                        error
                      ) =>
                        error.message
                    )
                    .join(
                      "; "
                    ),
              });

              continue;
            }

            results.updated.push({
              orderId:
                order.id,

              orderName:
                order.name,

              trackingNumber:
                currentTracking,

              status,
            });
          } catch (
            samexError
          ) {
            if (
              isNotFoundError(
                samexError
              )
            ) {
              const cleared =
                await clearSamexState({
                  admin,
                  order,
                });

              if (
                cleared.errors
                  .length >
                0
              ) {
                results.failed.push({
                  orderId:
                    order.id,

                  orderName:
                    order.name,

                  reason:
                    "Shipment not found, but Shopify tags could not be cleared.",
                });
              } else {
                results.notFound.push({
                  orderId:
                    order.id,

                  orderName:
                    order.name,

                  oldTracking:
                    tracking,
                });
              }

              continue;
            }

            throw samexError;
          }
        } catch (error) {
          results.failed.push({
            orderId,

            orderName:
              orderId,

            reason:
              error?.message ||
              "Unexpected synchronization error.",
          });
        }
      }

      return {
        ok:
          results.failed.length ===
          0,

        type:
          "bulk_sync_result",

        message:
          "Bulk Samex synchronization completed.",

        summary: {
          selected:
            selectedIds.length,

          updated:
            results.updated.length,

          notFound:
            results.notFound.length,

          skipped:
            results.skipped.length,

          failed:
            results.failed.length,
        },

        results,
      };
    }

    /* =====================================================
       AUTO SEND
       ===================================================== */

    if (
      intent ===
      "send_order_auto"
    ) {
      const orderId =
        String(
          formData.get(
            "orderId"
          ) || ""
        ).trim();

      try {
        const order =
          await getShopifyOrder(
            admin,
            orderId
          );

        if (!order) {
          throw new Error(
            "Shopify order not found."
          );
        }

        if (
          isAlreadySent(
            order.tags || []
          )
        ) {
          return {
            ok: false,

            type:
              "already_sent",

            message:
              "This order was already sent to Samex.",

            trackingNumber:
              getSamexTracking(
                order.tags ||
                  []
              ),
          };
        }

        const webi =
          extractWebiData(
            order
          );

        if (!webi.firstName) {
          throw new Error(
            "Customer name is missing."
          );
        }

        if (!webi.phone) {
          throw new Error(
            "Phone number is missing."
          );
        }

        if (
          !/^0[5-7]\d{8}$/.test(
            webi.phone
          )
        ) {
          throw new Error(
            `Invalid Algerian phone number: ${webi.phone}`
          );
        }

        if (!webi.address) {
          throw new Error(
            "Delivery address is missing."
          );
        }

        if (
          !webi.provinceCode
        ) {
          throw new Error(
            "Wilaya is missing."
          );
        }

        if (!webi.commune) {
          throw new Error(
            "Commune is missing."
          );
        }

        const wilayaId =
          Number(
            webi.provinceCode
          );

        const samex =
          getSamex();

        const communes =
          (await samex.getCommunes(
            wilayaId
          )) || [];

        const match =
          findCommune(
            communes,
            webi.commune
          );

        if (!match) {
          throw new Error(
            `WEBI Commune "${webi.commune}" was not found in Samex.`
          );
        }

        const codAmount =
          Number(
            order.totalPriceSet
              .shopMoney
              .amount
          );

        if (
          !Number.isFinite(
            codAmount
          )
        ) {
          throw new Error(
            "Invalid COD amount."
          );
        }

        const deliveryType =
          webi.stopDesk
            ? 2
            : 1;

        const orderData =
          new CreateOrderData({
            orderId:
              order.name,

            firstName:
              webi.firstName,

            lastName:
              webi.lastName,

            phone:
              webi.phone,

            address:
              webi.address,

            toWilayaId:
              wilayaId,

            toCommune:
              match.name,

            productDescription:
              getProductDescription(
                order
              ),

            price:
              Math.round(
                codAmount
              ),

            deliveryType,

            weight:
              1,

            notes:
              null,
          });

        const testMode =
          String(
            process.env
              .SAMEX_TEST_MODE
          ).toLowerCase() ===
          "true";

        if (testMode) {
          return {
            ok: true,

            type:
              "test",

            message:
              "TEST MODE: order was NOT sent to Samex.",

            preview:
              orderData,
          };
        }

        const result =
          await samex.createOrder(
            orderData
          );

        const trackingNumber =
          result?.trackingNumber ||
          result?.tracking ||
          null;

        const status =
          result?.status ||
          "pending";

        const saved =
          await saveSamexStatus({
            admin,
            order,

            status,

            trackingNumber,
          });

        return {
          ok: true,

          type:
            "sent",

          message:
            "Order sent to Samex successfully.",

          trackingNumber,

          status,

          savedToShopify:
            saved.errors
              .length ===
            0,
        };
      } catch (error) {
        return {
          ok: false,

          type:
            "order",

          message:
            error?.message ||
            "Samex rejected the order.",
        };
      }
    }

    /* =====================================================
       BULK SEND
       ===================================================== */

    if (
      intent ===
      "bulk_send"
    ) {
      let orderIds = [];

      try {
        orderIds =
          JSON.parse(
            String(
              formData.get(
                "orderIds"
              ) || "[]"
            )
          );
      } catch {
        return {
          ok: false,

          type:
            "bulk_result",

          message:
            "Invalid order selection.",
        };
      }

      orderIds = [
        ...new Set(
          orderIds
            .filter(Boolean)
            .slice(0, 50)
        ),
      ];

      if (
        orderIds.length ===
        0
      ) {
        return {
          ok: false,

          type:
            "bulk_result",

          message:
            "Select at least one order.",
        };
      }

      const results = {
        sent: [],
        skipped: [],
        needsReview: [],
        failed: [],
      };

      const samex =
        getSamex();

      const communeCache =
        new Map();

      const testMode =
        String(
          process.env
            .SAMEX_TEST_MODE
        ).toLowerCase() ===
        "true";

      for (
        const orderId of
        orderIds
      ) {
        try {
          const order =
            await getShopifyOrder(
              admin,
              orderId
            );

          if (!order) {
            results.failed.push({
              orderId,

              orderName:
                orderId,

              reason:
                "Shopify order not found.",
            });

            continue;
          }

          if (
            isAlreadySent(
              order.tags || []
            )
          ) {
            results.skipped.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Already sent to Samex.",

              trackingNumber:
                getSamexTracking(
                  order.tags ||
                    []
                ),
            });

            continue;
          }

          const webi =
            extractWebiData(
              order
            );

          if (!webi.firstName) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Customer name is missing.",
            });

            continue;
          }

          if (!webi.phone) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Phone number is missing.",
            });

            continue;
          }

          if (
            !/^0[5-7]\d{8}$/.test(
              webi.phone
            )
          ) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                `Invalid phone number: ${webi.phone}`,
            });

            continue;
          }

          if (!webi.address) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Delivery address is missing.",
            });

            continue;
          }

          if (
            !webi.provinceCode
          ) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Wilaya is missing.",
            });

            continue;
          }

          if (!webi.commune) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Commune is missing.",
            });

            continue;
          }

          const wilayaId =
            Number(
              webi.provinceCode
            );

          if (
            !communeCache.has(
              wilayaId
            )
          ) {
            communeCache.set(
              wilayaId,

              (await samex.getCommunes(
                wilayaId
              )) || []
            );
          }

          const communes =
            communeCache.get(
              wilayaId
            ) || [];

          const match =
            findCommune(
              communes,
              webi.commune
            );

          if (!match) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                `WEBI Commune "${webi.commune}" was not found in Samex.`,
            });

            continue;
          }

          const codAmount =
            Number(
              order.totalPriceSet
                .shopMoney
                .amount
            );

          if (
            !Number.isFinite(
              codAmount
            )
          ) {
            results.needsReview.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                "Invalid COD amount.",
            });

            continue;
          }

          const deliveryType =
            webi.stopDesk
              ? 2
              : 1;

          const orderData =
            new CreateOrderData({
              orderId:
                order.name,

              firstName:
                webi.firstName,

              lastName:
                webi.lastName,

              phone:
                webi.phone,

              address:
                webi.address,

              toWilayaId:
                wilayaId,

              toCommune:
                match.name,

              productDescription:
                getProductDescription(
                  order
                ),

              price:
                Math.round(
                  codAmount
                ),

              deliveryType,

              weight:
                1,

              notes:
                null,
            });

          if (testMode) {
            results.sent.push({
              orderId:
                order.id,

              orderName:
                order.name,

              trackingNumber:
                null,

              status:
                "test",

              commune:
                match.name,

              wilayaId,
            });

            continue;
          }

          try {
            const result =
              await samex.createOrder(
                orderData
              );

            const trackingNumber =
              result?.trackingNumber ||
              result?.tracking ||
              null;

            const status =
              result?.status ||
              "pending";

            await saveSamexStatus({
              admin,

              order,

              status,

              trackingNumber,
            });

            results.sent.push({
              orderId:
                order.id,

              orderName:
                order.name,

              trackingNumber,

              status,

              commune:
                match.name,

              wilayaId,
            });
          } catch (error) {
            results.failed.push({
              orderId:
                order.id,

              orderName:
                order.name,

              reason:
                error?.message ||
                "Samex API error.",
            });
          }
        } catch (error) {
          results.failed.push({
            orderId,

            orderName:
              orderId,

            reason:
              error?.message ||
              "Unexpected error.",
          });
        }
      }

      return {
        ok:
          results.failed
            .length === 0,

        type:
          "bulk_result",

        message:
          testMode
            ? "Bulk TEST completed. No real shipments were created."
            : "Bulk Samex processing completed.",

        summary: {
          selected:
            orderIds.length,

          sent:
            results.sent
              .length,

          skipped:
            results.skipped
              .length,

          needsReview:
            results.needsReview
              .length,

          failed:
            results.failed
              .length,
        },

        results,
      };
    }

    return {
      ok: false,

      message:
        "Unknown action.",
    };
  };

/* =========================================================
   UI STATUS
   ========================================================= */

function getOrderUiStatus(
  order
) {
  if (
    isAlreadySent(
      order.tags || []
    )
  ) {
    return "sent";
  }

  const webi =
    extractWebiData(
      order
    );

  if (
    !webi.firstName ||
    !webi.phone ||
    !webi.address ||
    !webi.provinceCode ||
    !webi.commune
  ) {
    return "review";
  }

  return "ready";
}

function statusLabel(
  status
) {
  if (status === "sent") {
    return "Sent";
  }

  if (status === "ready") {
    return "Ready";
  }

  if (status === "review") {
    return "Needs Review";
  }

  return "All";
}

function statusTone(
  status
) {
  if (status === "sent") {
    return "success";
  }

  if (status === "ready") {
    return "info";
  }

  if (status === "review") {
    return "warning";
  }

  return "neutral";
}

/* =========================================================
   ORDER ROW
   ========================================================= */

function OrderRow({
  order,
  selected,
  onToggle,
  onSend,
  onSync,
  busy,
}) {
  const webi =
    extractWebiData(
      order
    );

  const uiStatus =
    getOrderUiStatus(
      order
    );

  const tracking =
    getSamexTracking(
      order.tags || []
    );

  const status =
    getSamexStatus(
      order.tags || []
    );

  const total =
    Number(
      order.totalPriceSet
        .shopMoney
        .amount
    );

  const canSelect =
    uiStatus === "ready";

  const modalId =
    `review-${order.id.replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    )}`;

  return (
    <s-table-row>

      <s-table-cell>
        {canSelect ? (
          <input
            type="checkbox"
            checked={
              selected
            }
            onChange={() =>
              onToggle(
                order.id
              )
            }
          />
        ) : (
          "—"
        )}
      </s-table-cell>

      <s-table-cell>
        <strong>
          {order.name}
        </strong>
      </s-table-cell>

      <s-table-cell>
        {[
          webi.firstName,
          webi.lastName,
        ]
          .filter(Boolean)
          .join(" ") ||
          "—"}
      </s-table-cell>

      <s-table-cell>
        {webi.phone ||
          "—"}
      </s-table-cell>

      <s-table-cell>
        {webi.province ||
          "—"}

        {webi.provinceCode
          ? ` (${webi.provinceCode})`
          : ""}
      </s-table-cell>

      <s-table-cell>
        {webi.commune ||
          "—"}
      </s-table-cell>

      <s-table-cell>
        {Math.round(
          total
        )}{" "}
        DZD
      </s-table-cell>

      <s-table-cell>
        {webi.stopDesk
          ? "Stop Desk"
          : "Home"}
      </s-table-cell>

      <s-table-cell>
        <s-badge
          tone={statusTone(
            uiStatus
          )}
        >
          {statusLabel(
            uiStatus
          )}
        </s-badge>

        {uiStatus ===
          "sent" &&
        status ? (
          <div>
            {status}
          </div>
        ) : null}
      </s-table-cell>

      <s-table-cell>
        {tracking ||
          "—"}
      </s-table-cell>

      <s-table-cell>
        {uiStatus ===
        "sent" ? (
          <s-button
            onClick={() =>
              onSync(
                order.id
              )
            }
            disabled={
              busy
            }
          >
            Sync
          </s-button>
        ) : uiStatus ===
          "ready" ? (
          <s-button
            variant="primary"
            onClick={() =>
              onSend(
                order.id
              )
            }
            disabled={
              busy
            }
          >
            Send
          </s-button>
        ) : (
          <s-button
            commandFor={
              modalId
            }
          >
            Review
          </s-button>
        )}
      </s-table-cell>

    </s-table-row>
  );
}

/* =========================================================
   REVIEW MODAL
   ========================================================= */

function ReviewModal({
  order,
  wilayas,
}) {
  const fetcher =
    useFetcher();

  const communeFetcher =
    useFetcher();

  const revalidator =
    useRevalidator();

  const shopify =
    useAppBridge();

  const webi =
    extractWebiData(
      order
    );

  const modalId =
    `review-${order.id.replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    )}`;

  const [
    firstName,
    setFirstName,
  ] = useState(
    webi.firstName ===
      "Guest"
      ? ""
      : webi.firstName
  );

  const [
    lastName,
    setLastName,
  ] = useState(
    webi.lastName || ""
  );

  const [
    phone,
    setPhone,
  ] = useState(
    webi.phone || ""
  );

  const [
    address,
    setAddress,
  ] = useState(
    webi.address || ""
  );

  const [
    wilayaId,
    setWilayaId,
  ] = useState(
    webi.provinceCode ||
      ""
  );

  const [
    wilayaName,
    setWilayaName,
  ] = useState(
    webi.province ||
      ""
  );

  const [
    commune,
    setCommune,
  ] = useState("");

  const [
    stopDesk,
    setStopDesk,
  ] = useState(
    webi.stopDesk
  );

  const communes =
    communeFetcher.data
      ?.communes || [];

  useEffect(() => {
    if (!wilayaId) {
      return;
    }

    communeFetcher.submit(
      {
        intent:
          "get_communes",

        wilayaId,
      },
      {
        method:
          "post",
      }
    );
  }, [
    wilayaId,
  ]);

  useEffect(() => {
    if (
      !communes.length ||
      !webi.commune
    ) {
      return;
    }

    const match =
      findCommune(
        communes,
        webi.commune
      );

    if (match) {
      setCommune(
        String(
          match.name
        )
      );
    }
  }, [
    communes,
    webi.commune,
  ]);

  useEffect(() => {
    if (
      fetcher.data
        ?.ok &&
      fetcher.data
        ?.type ===
        "review_saved"
    ) {
      shopify.toast.show(
        fetcher.data
          .message
      );

      revalidator.revalidate();
    }
  }, [
    fetcher.data,
    shopify,
    revalidator,
  ]);

  const handleWilaya =
    (event) => {
      const value =
        String(
          event.currentTarget
            ?.value || ""
        );

      setWilayaId(
        value
      );

      const selected =
        wilayas.find(
          (item) =>
            String(
              item.id
            ) === value
        );

      setWilayaName(
        selected?.name ||
          ""
      );

      setCommune(
        ""
      );
    };

  const handleSave =
    () => {
      fetcher.submit(
        {
          intent:
            "save_review",

          orderId:
            order.id,

          firstName,
          lastName,
          phone,
          address,

          wilayaId,
          wilayaName,
          commune,

          stopDesk:
            String(
              stopDesk
            ),
        },
        {
          method:
            "post",
        }
      );
    };

  return (
    <s-modal
      id={
        modalId
      }
      heading={`Review ${order.name}`}
    >
      <s-section>

        <s-banner>
          Complete the missing
          delivery information.
        </s-banner>

        <s-text-field
          label="First name"
          value={
            firstName
          }
          onChange={(event) =>
            setFirstName(
              String(
                event.currentTarget
                  ?.value ||
                  ""
              )
            )
          }
        />

        <s-text-field
          label="Last name"
          value={
            lastName
          }
          onChange={(event) =>
            setLastName(
              String(
                event.currentTarget
                  ?.value ||
                  ""
              )
            )
          }
        />

        <s-text-field
          label="Phone"
          value={
            phone
          }
          onChange={(event) =>
            setPhone(
              String(
                event.currentTarget
                  ?.value ||
                  ""
              )
            )
          }
        />

        <s-text-field
          label="Address"
          value={
            address
          }
          onChange={(event) =>
            setAddress(
              String(
                event.currentTarget
                  ?.value ||
                  ""
              )
            )
          }
        />

        <s-select
          label="Wilaya"
          value={
            wilayaId
          }
          onChange={
            handleWilaya
          }
        >
          <s-option value="">
            Choose Wilaya
          </s-option>

          {wilayas.map(
            (
              item
            ) => (
              <s-option
                key={
                  item.id
                }
                value={String(
                  item.id
                )}
              >
                {
                  item.name
                }
              </s-option>
            )
          )}
        </s-select>

        <s-select
          label="Commune"
          value={
            commune
          }
          disabled={
            !wilayaId ||
            communeFetcher.state !==
              "idle"
          }
          onChange={(event) =>
            setCommune(
              String(
                event.currentTarget
                  ?.value ||
                  ""
              )
            )
          }
        >
          <s-option value="">
            {communeFetcher.state !==
            "idle"
              ? "Loading communes..."
              : "Choose Commune"}
          </s-option>

          {communes.map(
            (
              item,
              index
            ) => (
              <s-option
                key={
                  item.id ||
                  `${item.name}-${index}`
                }
                value={
                  String(
                    item.name
                  )
                }
              >
                {
                  item.name
                }
              </s-option>
            )
          )}
        </s-select>

        <s-select
          label="Delivery type"
          value={
            stopDesk
              ? "2"
              : "1"
          }
          onChange={(event) =>
            setStopDesk(
              String(
                event.currentTarget
                  ?.value ||
                  "1"
              ) ===
                "2"
            )
          }
        >
          <s-option value="1">
            Home Delivery
          </s-option>

          <s-option value="2">
            Stop Desk
          </s-option>
        </s-select>

        {fetcher.data
          ?.message && (
          <s-banner
            tone={
              fetcher.data
                .ok
                ? "success"
                : "critical"
            }
          >
            {
              fetcher.data
                .message
            }
          </s-banner>
        )}

      </s-section>

      <s-button
        slot="primary-action"
        variant="primary"
        onClick={
          handleSave
        }
        disabled={
          fetcher.state !==
          "idle"
        }
        {...(
          fetcher.state !==
          "idle"
            ? {
                loading:
                  true,
              }
            : {}
        )}
      >
        Save & Mark Ready
      </s-button>

      <s-button
        slot="secondary-actions"
        onClick={() =>
          shopify.modal.hide(
            modalId
          )
        }
      >
        Cancel
      </s-button>

    </s-modal>
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

export default function OrdersPage() {
  const {
    orders,
    wilayas,
  } =
    useLoaderData();

  const shopify =
    useAppBridge();

  const sendFetcher =
    useFetcher();

  const syncFetcher =
    useFetcher();

  const bulkFetcher =
    useFetcher();

  const bulkSyncFetcher =
    useFetcher();

  const testFetcher =
    useFetcher();

  const revalidator =
    useRevalidator();

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState(
    "all"
  );

  const [
    selectedIds,
    setSelectedIds,
  ] = useState([]);

  const filteredOrders =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return orders.filter(
        (order) => {
          const webi =
            extractWebiData(
              order
            );

          const text = [
            order.name,
            webi.firstName,
            webi.lastName,
            webi.phone,
            webi.address,
            webi.city,
            webi.commune,
            webi.province,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          const matchesSearch =
            !query ||
            text.includes(
              query
            );

          const orderStatus =
            getOrderUiStatus(
              order
            );

          const matchesStatus =
            statusFilter ===
              "all" ||
            orderStatus ===
              statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      orders,
      search,
      statusFilter,
    ]);

  const readyOrders =
    orders.filter(
      (order) =>
        getOrderUiStatus(
          order
        ) === "ready"
    );

  const sentOrders =
    orders.filter(
      (order) =>
        getOrderUiStatus(
          order
        ) === "sent"
    );

  const reviewOrders =
    orders.filter(
      (order) =>
        getOrderUiStatus(
          order
        ) === "review"
    );

  const allReadySelected =
    readyOrders.length >
      0 &&
    readyOrders.every(
      (order) =>
        selectedIds.includes(
          order.id
        )
    );

  const rowBusy =
    sendFetcher.state !==
      "idle" ||
    syncFetcher.state !==
      "idle";

  const bulkBusy =
    bulkFetcher.state !==
      "idle" ||
    bulkSyncFetcher.state !==
      "idle";

  /* =======================================================
     SELECTION
     ======================================================= */

  const toggleSelected =
    (orderId) => {
      setSelectedIds(
        (current) =>
          current.includes(
            orderId
          )
            ? current.filter(
                (id) =>
                  id !==
                  orderId
              )
            : [
                ...current,
                orderId,
              ]
      );
    };

  const toggleAllReady =
    () => {
      if (
        allReadySelected
      ) {
        setSelectedIds([]);
        return;
      }

      setSelectedIds(
        readyOrders.map(
          (order) =>
            order.id
        )
      );
    };

  const clearSelection =
    () => {
      setSelectedIds([]);
    };

  /* =======================================================
     SINGLE SEND
     ======================================================= */

  const sendSingle =
    (orderId) => {
      sendFetcher.submit(
        {
          intent:
            "send_order_auto",

          orderId,
        },
        {
          method:
            "post",
        }
      );
    };

  /* =======================================================
     SINGLE SYNC
     ======================================================= */

  const syncSingle =
    (orderId) => {
      syncFetcher.submit(
        {
          intent:
            "sync_status",

          orderId,
        },
        {
          method:
            "post",
        }
      );
    };

  /* =======================================================
     BULK SEND
     ======================================================= */

  const sendBulk =
    () => {
      if (
        selectedIds.length ===
        0
      ) {
        shopify.toast.show(
          "Select at least one ready order."
        );

        return;
      }

      const confirmed =
        window.confirm(
          `Send ${selectedIds.length} selected order(s) to Samex?`
        );

      if (!confirmed) {
        return;
      }

      bulkFetcher.submit(
        {
          intent:
            "bulk_send",

          orderIds:
            JSON.stringify(
              selectedIds
            ),
        },
        {
          method:
            "post",
        }
      );
    };

  /* =======================================================
     BULK SYNC
     ======================================================= */

  const syncAllSamex =
    () => {
      const confirmed =
        window.confirm(
          `Synchronize all visible Samex shipments? This will NOT create new shipments.`
        );

      if (!confirmed) {
        return;
      }

      bulkSyncFetcher.submit(
        {
          intent:
            "bulk_sync",
        },
        {
          method:
            "post",
        }
      );
    };

  /* =======================================================
     TEST CONNECTION
     ======================================================= */

  const testConnection =
    () => {
      testFetcher.submit(
        {
          intent:
            "test_connection",
        },
        {
          method:
            "post",
        }
      );
    };

  /* =======================================================
     SEND FEEDBACK
     ======================================================= */

  useEffect(() => {
    if (
      sendFetcher.data
        ?.ok
    ) {
      shopify.toast.show(
        sendFetcher.data
          .message
      );

      revalidator.revalidate();
    }
  }, [
    sendFetcher.data,
  ]);

  /* =======================================================
     SYNC FEEDBACK
     ======================================================= */

  useEffect(() => {
    if (
      syncFetcher.data
        ?.ok
    ) {
      shopify.toast.show(
        syncFetcher.data
          .message
      );

      revalidator.revalidate();
    }
  }, [
    syncFetcher.data,
  ]);

  /* =======================================================
     BULK SEND FEEDBACK
     ======================================================= */

  useEffect(() => {
    if (
      bulkFetcher.data
        ?.type ===
      "bulk_result"
    ) {
      const summary =
        bulkFetcher.data
          .summary;

      if (summary) {
        shopify.toast.show(
          `${summary.sent} sent, ${summary.needsReview} needs review, ${summary.skipped} skipped, ${summary.failed} failed.`
        );
      }

      setSelectedIds([]);

      revalidator.revalidate();
    }
  }, [
    bulkFetcher.data,
  ]);

  /* =======================================================
     BULK SYNC FEEDBACK
     ======================================================= */

  useEffect(() => {
    if (
      bulkSyncFetcher.data
        ?.type ===
      "bulk_sync_result"
    ) {
      const summary =
        bulkSyncFetcher.data
          .summary;

      if (summary) {
        shopify.toast.show(
          `${summary.updated} updated, ${summary.notFound} not found, ${summary.skipped} skipped, ${summary.failed} failed.`
        );
      }

      revalidator.revalidate();
    }
  }, [
    bulkSyncFetcher.data,
  ]);

  /* =======================================================
     TEST CONNECTION FEEDBACK
     ======================================================= */

  useEffect(() => {
    if (
      testFetcher.data
        ?.ok
    ) {
      shopify.toast.show(
        testFetcher.data
          .message
      );
    }
  }, [
    testFetcher.data,
  ]);

  /* =======================================================
     OB ECOTRACK ANALYTICS INSTALLED
     ======================================================= */

  const analytics = useMemo(() => {
    const stats = {
      sent: 0,
      pending: 0,
      pickedUp: 0,
      inTransit: 0,
      outForDelivery: 0,
      delivered: 0,
      failedDelivery: 0,
      returning: 0,
      returned: 0,
      cancelled: 0,
      exception: 0,

      codTotal: 0,
      deliveredCod: 0,
      returnedCod: 0,

      wilayas: {},
    };

    const normalizeAnalyticsStatus =
      (value) =>
        String(
          value || "pending"
        )
          .trim()
          .toLowerCase()
          .replace(
            /[-\s]+/g,
            "_"
          );

    for (
      const order of orders
    ) {
      const tags =
        order.tags || [];

      const tracking =
        getSamexTracking(
          tags
        );

      const sent =
        isAlreadySent(
          tags
        );

      const total =
        Number(
          order.totalPriceSet
            ?.shopMoney
            ?.amount || 0
        );

      if (!sent) {
        continue;
      }

      stats.sent++;

      stats.codTotal +=
        Number.isFinite(total)
          ? total
          : 0;

      const rawStatus =
        getSamexStatus(
          tags
        );

      let status =
        normalizeAnalyticsStatus(
          rawStatus
        );

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
        delivery_failed:
          "failed_delivery",

        return: "returning",
        retour: "returning",

        canceled: "cancelled",

        problem: "exception",
      };

      status =
        aliases[status] ||
        status;

      if (
        status ===
        "pending"
      ) {
        stats.pending++;
      }

      if (
        status ===
        "picked_up"
      ) {
        stats.pickedUp++;
      }

      if (
        status ===
        "in_transit"
      ) {
        stats.inTransit++;
      }

      if (
        status ===
        "out_for_delivery"
      ) {
        stats.outForDelivery++;
      }

      if (
        status ===
        "delivered"
      ) {
        stats.delivered++;
        stats.deliveredCod +=
          Number.isFinite(total)
            ? total
            : 0;
      }

      if (
        status ===
        "failed_delivery"
      ) {
        stats.failedDelivery++;
      }

      if (
        status ===
        "returning"
      ) {
        stats.returning++;
      }

      if (
        status ===
        "returned"
      ) {
        stats.returned++;

        stats.returnedCod +=
          Number.isFinite(total)
            ? total
            : 0;
      }

      if (
        status ===
        "cancelled"
      ) {
        stats.cancelled++;
      }

      if (
        status ===
        "exception"
      ) {
        stats.exception++;
      }

      const webi =
        extractWebiData(
          order
        );

      const wilaya =
        webi.province ||
        webi.provinceCode ||
        "Unknown";

      if (
        !stats.wilayas[
          wilaya
        ]
      ) {
        stats.wilayas[
          wilaya
        ] = 0;
      }

      stats.wilayas[
        wilaya
      ]++;
    }

    const deliveryRate =
      stats.sent > 0
        ? (
            stats.delivered /
            stats.sent
          ) *
          100
        : 0;

    const returnRate =
      stats.sent > 0
        ? (
            stats.returned /
            stats.sent
          ) *
          100
        : 0;

    const topWilayas =
      Object.entries(
        stats.wilayas
      )
        .sort(
          (a, b) =>
            b[1] -
            a[1]
        )
        .slice(
          0,
          5
        );

    return {
      ...stats,

      deliveryRate:
        Number(
          deliveryRate.toFixed(
            1
          )
        ),

      returnRate:
        Number(
          returnRate.toFixed(
            1
          )
        ),

      topWilayas,

      trackingCount:
        orders.filter(
          (order) =>
            Boolean(
              getSamexTracking(
                order.tags ||
                  []
              )
            )
        ).length,
    };
  }, [
    orders,
  ]);

  return (
    <s-page
      heading="OB EcoTrack"
    >

      {/* =================================================
         PRIMARY ACTION
         ================================================= */}

      <s-button
        slot="primary-action"
        onClick={
          testConnection
        }
        {...(
          testFetcher.state !==
          "idle"
            ? {
                loading:
                  true,
              }
            : {}
        )}
      >
        Test Samex Connection
      </s-button>

      {/* =================================================
         STATS
         ================================================= */}

      <s-section>
        <s-grid
          gridTemplateColumns="repeat(4, minmax(0, 1fr))"
          gap="base"
        >

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-heading>
              {
                orders.length
              }
            </s-heading>

            <s-paragraph>
              Total Orders
            </s-paragraph>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-heading>
              {
                readyOrders.length
              }
            </s-heading>

            <s-paragraph>
              Ready
            </s-paragraph>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-heading>
              {
                sentOrders.length
              }
            </s-heading>

            <s-paragraph>
              Sent to Samex
            </s-paragraph>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-heading>
              {
                reviewOrders.length
              }
            </s-heading>

            <s-paragraph>
              Needs Review
            </s-paragraph>
          </s-box>

        </s-grid>
      </s-section>

      {/* =================================================
         BULK ACTIONS
         ================================================= */}

      <s-section
        heading="Bulk Actions"
      >
        <s-stack
          direction="inline"
          gap="base"
        >

          <s-button
            onClick={
              toggleAllReady
            }
          >
            {allReadySelected
              ? "Clear Ready"
              : "Select Ready"}
          </s-button>

          <s-button
            onClick={
              clearSelection
            }
            disabled={
              selectedIds.length ===
              0
            }
          >
            Clear Selection
          </s-button>

          <s-button
            variant="primary"
            onClick={
              sendBulk
            }
            disabled={
              selectedIds.length ===
                0 ||
              bulkBusy
            }
            {...(
              bulkBusy
                ? {
                    loading:
                      true,
                  }
                : {}
            )}
          >
            Send Selected
          </s-button>

          <s-button
            onClick={
              syncAllSamex
            }
            disabled={
              bulkBusy ||
              sentOrders.length ===
                0
            }
            {...(
              bulkSyncFetcher.state !==
              "idle"
                ? {
                    loading:
                      true,
                  }
                : {}
            )}
          >
            Sync All Samex
          </s-button>

          <s-badge>
            Selected:{" "}
            {
              selectedIds.length
            }
          </s-badge>

        </s-stack>
      </s-section>

      {/* =================================================
         BULK SEND RESULT
         ================================================= */}

      {bulkFetcher.data
        ?.type ===
        "bulk_result" && (
        <s-section
          heading="Last Bulk Send"
        >
          <s-banner
            tone={
              bulkFetcher.data
                .ok
                ? "success"
                : "warning"
            }
          >
            {
              bulkFetcher.data
                .message
            }
          </s-banner>

          <s-stack
            direction="inline"
            gap="base"
          >
            <s-badge
              tone="success"
            >
              Sent:{" "}
              {
                bulkFetcher.data
                  .summary
                  .sent
              }
            </s-badge>

            <s-badge>
              Skipped:{" "}
              {
                bulkFetcher.data
                  .summary
                  .skipped
              }
            </s-badge>

            <s-badge
              tone="warning"
            >
              Needs Review:{" "}
              {
                bulkFetcher.data
                  .summary
                  .needsReview
              }
            </s-badge>

            <s-badge
              tone="critical"
            >
              Failed:{" "}
              {
                bulkFetcher.data
                  .summary
                  .failed
              }
            </s-badge>
          </s-stack>
        </s-section>
      )}

      {/* =================================================
         BULK SYNC RESULT
         ================================================= */}

      {bulkSyncFetcher.data
        ?.type ===
        "bulk_sync_result" && (
        <s-section
          heading="Last Bulk Sync"
        >
          <s-banner
            tone={
              bulkSyncFetcher.data
                .ok
                ? "success"
                : "warning"
            }
          >
            {
              bulkSyncFetcher.data
                .message
            }
          </s-banner>

          <s-stack
            direction="inline"
            gap="base"
          >
            <s-badge
              tone="success"
            >
              Updated:{" "}
              {
                bulkSyncFetcher.data
                  .summary
                  .updated
              }
            </s-badge>

            <s-badge
              tone="warning"
            >
              Not Found:{" "}
              {
                bulkSyncFetcher.data
                  .summary
                  .notFound
              }
            </s-badge>

            <s-badge>
              Skipped:{" "}
              {
                bulkSyncFetcher.data
                  .summary
                  .skipped
              }
            </s-badge>

            <s-badge
              tone="critical"
            >
              Failed:{" "}
              {
                bulkSyncFetcher.data
                  .summary
                  .failed
              }
            </s-badge>
          </s-stack>

          {bulkSyncFetcher.data
            .results?.updated
            ?.length > 0 && (
            <s-section
              heading="Updated"
            >
              {bulkSyncFetcher.data
                .results.updated
                .map(
                  (
                    item,
                    index
                  ) => (
                    <s-paragraph
                      key={`${item.orderId}-${index}`}
                    >
                      ✓{" "}
                      {
                        item.orderName
                      }
                      {" — "}
                      {
                        item.status
                      }
                      {" — "}
                      {
                        item.trackingNumber
                      }
                    </s-paragraph>
                  )
                )}
            </s-section>
          )}

          {bulkSyncFetcher.data
            .results?.notFound
            ?.length > 0 && (
            <s-section
              heading="Not Found"
            >
              {bulkSyncFetcher.data
                .results.notFound
                .map(
                  (
                    item,
                    index
                  ) => (
                    <s-paragraph
                      key={`${item.orderId}-${index}`}
                    >
                      ⚠{" "}
                      {
                        item.orderName
                      }
                      {" — old tracking "}
                      {
                        item.oldTracking
                      }
                      {" removed from Shopify."}
                    </s-paragraph>
                  )
                )}
            </s-section>
          )}

          {bulkSyncFetcher.data
            .results?.skipped
            ?.length > 0 && (
            <s-section
              heading="Skipped"
            >
              {bulkSyncFetcher.data
                .results.skipped
                .map(
                  (
                    item,
                    index
                  ) => (
                    <s-paragraph
                      key={`${item.orderId}-${index}`}
                    >
                      ⏭{" "}
                      {
                        item.orderName
                      }
                      {" — "}
                      {
                        item.reason
                      }
                    </s-paragraph>
                  )
                )}
            </s-section>
          )}

          {bulkSyncFetcher.data
            .results?.failed
            ?.length > 0 && (
            <s-section
              heading="Failed"
            >
              {bulkSyncFetcher.data
                .results.failed
                .map(
                  (
                    item,
                    index
                  ) => (
                    <s-paragraph
                      key={`${item.orderId}-${index}`}
                    >
                      ✕{" "}
                      {
                        item.orderName
                      }
                      {" — "}
                      {
                        item.reason
                      }
                    </s-paragraph>
                  )
                )}
            </s-section>
          )}
        </s-section>
      )}

      {/* =================================================
         ORDERS
         ================================================= */}

      <s-section
        heading="Orders"
        padding="none"
      >

        <s-table>

          <s-search-field
            slot="filters"
            label="Search"
            labelAccessibilityVisibility="exclusive"
            placeholder="Order, customer, phone, commune..."
            value={
              search
            }
            onChange={(event) =>
              setSearch(
                String(
                  event.currentTarget
                    ?.value ||
                  ""
                )
              )
            }
          />

          <s-select
            slot="filters"
            label="Status"
            value={
              statusFilter
            }
            onChange={(event) =>
              setStatusFilter(
                String(
                  event.currentTarget
                    ?.value ||
                  "all"
                )
              )
            }
          >
            <s-option value="all">
              All
            </s-option>

            <s-option value="ready">
              Ready
            </s-option>

            <s-option value="sent">
              Sent
            </s-option>

            <s-option value="review">
              Needs Review
            </s-option>
          </s-select>

          <s-table-header-row>

            <s-table-header>
              Select
            </s-table-header>

            <s-table-header>
              Order
            </s-table-header>

            <s-table-header>
              Customer
            </s-table-header>

            <s-table-header>
              Phone
            </s-table-header>

            <s-table-header>
              Wilaya
            </s-table-header>

            <s-table-header>
              Commune
            </s-table-header>

            <s-table-header>
              COD
            </s-table-header>

            <s-table-header>
              Delivery
            </s-table-header>

            <s-table-header>
              Status
            </s-table-header>

            <s-table-header>
              Tracking
            </s-table-header>

            <s-table-header>
              Action
            </s-table-header>

          </s-table-header-row>

          <s-table-body>

            {filteredOrders.length ===
            0 ? (
              <s-table-row>

                <s-table-cell>
                  No orders match
                  your filters.
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

                <s-table-cell>
                  —
                </s-table-cell>

              </s-table-row>
            ) : (
              filteredOrders.map(
                (order) => (
                  <OrderRow
                    key={
                      order.id
                    }

                    order={
                      order
                    }

                    selected={
                      selectedIds.includes(
                        order.id
                      )
                    }

                    onToggle={
                      toggleSelected
                    }

                    onSend={
                      sendSingle
                    }

                    onSync={
                      syncSingle
                    }

                    busy={
                      rowBusy
                    }
                  />
                )
              )
            )}

          </s-table-body>

        </s-table>

      </s-section>

      {/* =================================================
         REVIEW MODALS
         ================================================= */}

      {orders
        .filter(
          (order) =>
            getOrderUiStatus(
              order
            ) ===
            "review"
        )
        .map(
          (order) => (
            <ReviewModal
              key={
                `modal-${order.id}`
              }

              order={
                order
              }

              wilayas={
                wilayas
              }
            />
          )
        )}

    </s-page>
  );
}

/* =========================================================
   HEADERS
   ========================================================= */

export const headers =
  (headersArgs) => {
    return boundary.headers(
      headersArgs
    );
  };

