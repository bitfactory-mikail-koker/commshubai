declare const safeHtmlBrand: unique symbol;

export type SafeHtml = string & { readonly [safeHtmlBrand]: true };

export const fromEditor = (html: string): SafeHtml => html as SafeHtml;
