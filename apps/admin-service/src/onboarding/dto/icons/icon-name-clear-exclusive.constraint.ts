import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

type ClearIconFields = { clearIconName?: boolean; iconName?: string };

@ValidatorConstraint({ name: 'iconNameExclusiveWithClear', async: false })
export class IconNameExclusiveWithClearConstraint implements ValidatorConstraintInterface {
  validate(iconName: string | undefined, args: ValidationArguments) {
    const o = args.object as ClearIconFields;
    if (o.clearIconName === true && iconName !== undefined && iconName !== '') {
      return false;
    }
    return true;
  }

  defaultMessage() {
    return 'Do not pass iconName when clearIconName is true';
  }
}
