// A proof fixture for the frozen operator grammar. The interface remains
// hand-authored; tests compare each route against this small canonical table.
export const OPERATOR_MATRIX = Object.freeze([
  Object.freeze([
    Object.freeze({ id: "refine-backward", area: "refine-backward", key: "Q", label: "Refine Backward", shifted: "Local Refine Backward" }),
    Object.freeze({ id: "reopen", area: "reopen", key: "W", label: "Reopen" }),
    Object.freeze({ id: "refine-forward", area: "refine-forward", key: "E", label: "Refine Forward", shifted: "Local Refine Forward" })
  ]),
  Object.freeze([
    Object.freeze({ id: "step-backward", area: "step-backward", key: "A", label: "Step Backward", shifted: "Previous Pin" }),
    Object.freeze({ id: "switch-endpoint", area: "switch-endpoint", key: "S", label: "Switch Endpoint" }),
    Object.freeze({ id: "step-forward", area: "step-forward", key: "D", label: "Step Forward", shifted: "Next Pin" })
  ]),
  Object.freeze([
    Object.freeze({ id: "release", area: "release", key: "R", label: "Release" }),
    Object.freeze({ id: "tag", area: "tag", key: "T", label: "Tag as Pin", shifted: "Tag as Section" }),
    Object.freeze({ id: "focus-toggle", area: "focus", key: "F", label: "Focus / Unfocus" })
  ])
]);

export const operatorCells = () => OPERATOR_MATRIX.flat();
