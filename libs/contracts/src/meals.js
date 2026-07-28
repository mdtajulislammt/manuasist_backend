"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEAL_SLOT_OPTIONS = exports.MEAL_PORTION_FACTORS = exports.MEAL_PORTION_OPTIONS = exports.MealSlot = void 0;
var MealSlot;
(function (MealSlot) {
    MealSlot["BREAKFAST"] = "BREAKFAST";
    MealSlot["LUNCH"] = "LUNCH";
    MealSlot["DINNER"] = "DINNER";
    MealSlot["SNACKS"] = "SNACKS";
})(MealSlot || (exports.MealSlot = MealSlot = {}));
exports.MEAL_PORTION_OPTIONS = [
    { factor: 0.5, label: 'Small (1/2)' },
    { factor: 1.0, label: 'Medium (1x)' },
    { factor: 1.5, label: 'Large (1.5x)' },
];
exports.MEAL_PORTION_FACTORS = exports.MEAL_PORTION_OPTIONS.map((option) => option.factor);
exports.MEAL_SLOT_OPTIONS = [
    { slot: MealSlot.BREAKFAST, label: 'Breakfast' },
    { slot: MealSlot.LUNCH, label: 'Lunch' },
    { slot: MealSlot.DINNER, label: 'Dinner' },
    { slot: MealSlot.SNACKS, label: 'Snacks' },
];
//# sourceMappingURL=meals.js.map