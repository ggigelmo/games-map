/**
 * Real polyline returned by Valhalla (Stadia Maps) for a driving route from
 * Puerta del Sol to Chamartin, Madrid. Captured from the API, not made up.
 *
 * Route: 5.189 km / 443 s / 11 maneuvers.
 *
 * Only the tests import this, so it doesn't end up in the app bundle.
 */
export const MADRID_SHAPE =
  '_s{alAbu`aFw@eCu@kBaB}A_h@mWcBq@mHbVgDlMy@bDi@`A{AZcCs@w@}@_CuDkLcLsLmHqNsKmB_A_BIeS_@eBMqBQJiDPkGFsBFuBj@yRNgFFqBFqBH}Cv@iX@_@HiILcLFqDBy@ZiJj@}Kf@oHP}Bf@}Fx@yHt@mG~@uG~C}QpA_Hf@gCf@iC~@aFtOcy@bB{I`Lul@lEqUTkALi@^aCbA_C^y@~E_Mf@mAl@{AbC_FaBmImA{IqBwOkAiKOmAa@kDm@}EGe@[eCeEm`@{B{To@cGe@aFQkD?K?s@A_DHwBBiANoBHs@RmBVwEb@iLPyH@eGMaFa@oD_BwFkBk@yN{BsDm@oGgAaGO{Ae@sfAq_@igAy_@_A]sGkCaC{@e`@}Mu@YoIuCqSkHa`@mNgSgHs@W}B}@cC_AuB_AuH_DqE}AcQiGqAc@cAOgAOmAIqAC_BPwCn@oCRqB?iBI_BCaCIkBMkFu@_AMg{Bo_@eEq@oF_AafAqQoGeAk`AcPkHmA{Ew@uoCsd@}DOsk@vF{m@vGsJVeC?iCO}@GcKsAwCFyCZ}A^{Ar@sAz@oAbAkAhA_AnAsCbEk@r@sH|H{FfEyD`CarAbx@kWvMiAl@yAt@qEfCcG`CcExAsN|EsAf@q@T{TbH_v@rQwf@xK_GjAaPlA{Lj@eVj@{Ev@aG~@qF`@sK_@aVwAaYiAkDIagAcFcTw@qr@qDgq@iDuMYcLTaEMmBIyAQajDeNqaAqEufAcFiF[{F]g@}Ee@yBq@sBi@mAgAmBaCoCcAu@gBaAsAsKGi@_@sFBmAf@qSPkHJaElAqh@FcCDcBDsA';

/** What was requested from Valhalla. The route starts right at these points. */
export const ORIGIN = { lng: -3.7038, lat: 40.4168 };
export const DESTINATION = { lng: -3.6883, lat: 40.453 };
